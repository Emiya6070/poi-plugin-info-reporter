'use strict';

const crypto = require('crypto');

const {
  isKcsApiPath,
  isBattleApiPath,
  isBattleResultApiPath,
  isMapApiPath,
  isPointApiPath,
  normalizeApiPath,
  parseRequestBody,
  parseResponsePayload,
} = require('./lib/api-path');
const {
  buildBattlePoiContext,
  readPlayerIdentity,
} = require('./poi-context');
const {
  START2_PATH,
  computeStart2Version,
} = require('./lib/start2-version');
const { BattleDetailBuilder } = require('../src/runtime/battle-detail-builder');

const PATCH_MARK = '__poiKancolleForwarder__';

function createClientEventId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function createForwarder(options) {
  const client = options && options.client;
  const getTargetUrl = options && options.getTargetUrl;
  const getProxyUrl = options && options.getProxyUrl;
  const getToken = options && options.getToken;
  const getStore = options && options.getStore;
  const cleanups = [];
  const battleDetailBuilder = new BattleDetailBuilder({ getStore });
  const syncedStart2Versions = new Set();
  const syncingStart2Versions = new Set();
  let pendingStart2 = null;
  let activeStart2Version = null;
  const sortieContext = {
    mapareaId: null,
    mapinfoNo: null,
    cell: null,
    deckId: null,
    nextCount: null,
    compassShown: null,
    eventId: null,
    eventKind: null,
    colorNo: null,
    bossCell: null,
    battleChainId: null,
  };

  function resetSortieContext() {
    sortieContext.mapareaId = null;
    sortieContext.mapinfoNo = null;
    sortieContext.cell = null;
    sortieContext.deckId = null;
    sortieContext.nextCount = null;
    sortieContext.compassShown = null;
    sortieContext.eventId = null;
    sortieContext.eventKind = null;
    sortieContext.colorNo = null;
    sortieContext.bossCell = null;
    sortieContext.battleChainId = null;
  }

  // Battle chain ids only travel on packets that form a node battle chain:
  // map movement that opens it, the battle packets, and its battleresult.
  function shouldAttachBattleChain(path) {
    return isPointApiPath(path) || isBattleApiPath(path) || isBattleResultApiPath(path);
  }

  function updateSortieContext(path, request, response) {
    const body = response && (response.api_data || response.data || response);
    if (path === '/kcsapi/api_req_map/start') {
      // Every node movement starts a new battle chain: the day battle(s),
      // optional midnight follow-up and the battleresult of the node share
      // this id until the next start/next packet replaces it.
      sortieContext.battleChainId = createClientEventId();
      sortieContext.mapareaId = request.api_maparea_id || body.api_maparea_id || sortieContext.mapareaId;
      sortieContext.mapinfoNo = request.api_mapinfo_no || request.api_map_no
        || body.api_mapinfo_no || sortieContext.mapinfoNo;
      sortieContext.cell = body.api_no || body.api_cell_no || sortieContext.cell;
      sortieContext.deckId = request.api_deck_id || body.api_deck_id || sortieContext.deckId;
      sortieContext.nextCount = body.api_next !== undefined ? body.api_next : sortieContext.nextCount;
      sortieContext.compassShown = body.api_rashin_flg !== undefined ? body.api_rashin_flg : sortieContext.compassShown;
      sortieContext.eventId = body.api_event_id !== undefined ? body.api_event_id : sortieContext.eventId;
      sortieContext.eventKind = body.api_event_kind !== undefined ? body.api_event_kind : sortieContext.eventKind;
      sortieContext.colorNo = body.api_color_no !== undefined ? body.api_color_no : sortieContext.colorNo;
      sortieContext.bossCell = body.api_bosscell_no !== undefined ? body.api_bosscell_no : sortieContext.bossCell;
      return;
    }
    if (path === '/kcsapi/api_req_map/next' || path === '/kcsapi/api_req_map/air_raid') {
      sortieContext.battleChainId = createClientEventId();
      if (body.api_maparea_id != null) sortieContext.mapareaId = body.api_maparea_id;
      if (body.api_mapinfo_no != null) sortieContext.mapinfoNo = body.api_mapinfo_no;
      sortieContext.cell = body.api_no || body.api_cell_no || sortieContext.cell;
      sortieContext.nextCount = body.api_next !== undefined ? body.api_next : sortieContext.nextCount;
      sortieContext.compassShown = body.api_rashin_flg !== undefined ? body.api_rashin_flg : sortieContext.compassShown;
      sortieContext.eventId = body.api_event_id !== undefined ? body.api_event_id : sortieContext.eventId;
      sortieContext.eventKind = body.api_event_kind !== undefined ? body.api_event_kind : sortieContext.eventKind;
      sortieContext.colorNo = body.api_color_no !== undefined ? body.api_color_no : sortieContext.colorNo;
      sortieContext.bossCell = body.api_bosscell_no !== undefined ? body.api_bosscell_no : sortieContext.bossCell;
      return;
    }
    if (path === '/kcsapi/api_req_practice/battle') {
      // Practice battles have no map movement packet to open their chain.
      sortieContext.battleChainId = createClientEventId();
      return;
    }
    if (path === '/kcsapi/api_port/port') {
      resetSortieContext();
    }
  }

  function withSortieContextRequest(request) {
    const next = Object.assign({}, request || {});
    if ((next.api_maparea_id === undefined || next.api_maparea_id === null) && sortieContext.mapareaId != null) {
      next.api_maparea_id = sortieContext.mapareaId;
    }
    if ((next.api_mapinfo_no === undefined || next.api_mapinfo_no === null) && sortieContext.mapinfoNo != null) {
      next.api_mapinfo_no = sortieContext.mapinfoNo;
    }
    if ((next.api_no === undefined || next.api_no === null) && sortieContext.cell != null) {
      next.api_no = sortieContext.cell;
    }
    if ((next.api_deck_id === undefined || next.api_deck_id === null) && sortieContext.deckId != null) {
      next.api_deck_id = sortieContext.deckId;
    }
    [
      ['api_next', 'nextCount'],
      ['api_rashin_flg', 'compassShown'],
      ['api_event_id', 'eventId'],
      ['api_event_kind', 'eventKind'],
      ['api_color_no', 'colorNo'],
      ['api_bosscell_no', 'bossCell'],
    ].forEach(([apiKey, contextKey]) => {
      if ((next[apiKey] === undefined || next[apiKey] === null) && sortieContext[contextKey] != null) {
        next[apiKey] = sortieContext[contextKey];
      }
    });
    return next;
  }

  function syncPendingStart2(player, source) {
    if (!pendingStart2 || !player || player.api_member_id == null) return null;
    const memberId = String(player.api_member_id);
    const syncKey = `${memberId}:${pendingStart2.version}`;
    if (syncedStart2Versions.has(syncKey) || syncingStart2Versions.has(syncKey)) return null;
    syncingStart2Versions.add(syncKey);
    const common = {
      clientEventId: createClientEventId(),
      source: source || 'game.response',
      path: START2_PATH,
      time: pendingStart2.time,
      capturedAt: pendingStart2.capturedAt,
      player,
      start2Version: pendingStart2.version,
    };
    const probe = Object.assign({}, common, { type: 'start2_version_probe' });
    const upload = Object.assign({}, common, {
      type: 'start2_data',
      response: pendingStart2.response,
    });
    const pending = typeof client.syncStart2 === 'function'
      ? client.syncStart2(probe, upload)
      : client.send(upload);
    if (pending && typeof pending.then === 'function') {
      pending.then(() => {
        syncedStart2Versions.add(syncKey);
        syncingStart2Versions.delete(syncKey);
      }).catch(() => {
        syncingStart2Versions.delete(syncKey);
      });
    } else {
      syncedStart2Versions.add(syncKey);
      syncingStart2Versions.delete(syncKey);
    }
    return pending;
  }

  function forwardGameResponse(detail, source) {
    if (!detail || !detail.path) return null;
    const path = normalizeApiPath(detail.path);
    if (!isKcsApiPath(path)
      || (!isPointApiPath(path)
        && !isMapApiPath(path)
        && !isBattleApiPath(path)
        && !isBattleResultApiPath(path)
        && path !== START2_PATH
        && path !== '/kcsapi/api_port/port')) {
      return null;
    }

    if (getTargetUrl && typeof client.setUrl === 'function') {
      client.setUrl(getTargetUrl());
    }
    if (getProxyUrl && typeof client.setProxyUrl === 'function') {
      client.setProxyUrl(getProxyUrl());
    }
    if (getToken && typeof client.setToken === 'function') {
      client.setToken(getToken());
    }

    const rawRequest = parseRequestBody(detail.postBody || detail.request || detail.params);
    const response = parseResponsePayload(detail.body || detail.response || detail.payload);
    updateSortieContext(path, rawRequest, response);
    const time = detail.time || detail.timestamp || Date.now();
    if (path === START2_PATH) {
      activeStart2Version = computeStart2Version(response);
      pendingStart2 = {
        version: activeStart2Version,
        capturedAt: new Date(time).toISOString(),
        time,
        response,
      };
      battleDetailBuilder.handleGameResponse({
        path,
        postBody: rawRequest,
        body: response,
        time,
      });
      return { ok: true, path, kind: 'start2', start2Version: activeStart2Version };
    }
    if (path === '/kcsapi/api_port/port') {
      battleDetailBuilder.handleGameResponse({
        path,
        postBody: rawRequest,
        body: response,
        time,
      });
      if (getStore) {
        syncPendingStart2(readPlayerIdentity(getStore), source);
      }
      return {
        ok: true,
        path,
        kind: 'start2_sync',
        start2Version: activeStart2Version,
      };
    }

    const request = withSortieContextRequest(rawRequest);
    const battleDetail = battleDetailBuilder.handleGameResponse({
      path,
      postBody: request,
      body: response,
      time,
    });
    const poiContext = getStore
      ? buildBattlePoiContext(getStore, {
        path,
        deckId: request.api_deck_id || sortieContext.deckId,
        response,
        combined: String(path).includes('combined_battle'),
      })
      : null;
    const message = {
      type: 'api',
      clientEventId: createClientEventId(),
      source: source || 'game.response',
      path,
      request,
      response,
      time,
      start2Version: activeStart2Version,
      player: poiContext && poiContext.player ? poiContext.player : null,
      poiContext,
    };
    if (sortieContext.battleChainId != null && shouldAttachBattleChain(path)) {
      message.battleChainId = sortieContext.battleChainId;
    }
    if ((isBattleApiPath(path) || isBattleResultApiPath(path)) && battleDetail) {
      message.battleDetail = battleDetail;
    }
    const pending = client.send(message);
    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => {});
    }
    return { ok: true, path };
  }

  function installGlobalCapture(root) {
    const target = root || (typeof window !== 'undefined' ? window : global);
    if (!target || target[PATCH_MARK]) return;

    const onGameResponse = (event) => {
      try {
        forwardGameResponse(event && event.detail, 'game.response');
      } catch (error) {
        // Keep the POI event loop independent from an unavailable forwarding target.
      }
    };
    if (typeof target.addEventListener === 'function') {
      target.addEventListener('game.response', onGameResponse);
      cleanups.push(() => target.removeEventListener('game.response', onGameResponse));
    }
    target[PATCH_MARK] = true;
  }

  function uninstallGlobalCapture(root) {
    const target = root || (typeof window !== 'undefined' ? window : global);
    while (cleanups.length) cleanups.pop()();
    if (target) target[PATCH_MARK] = false;
  }

  return {
    forwardGameResponse,
    installGlobalCapture,
    uninstallGlobalCapture,
  };
}

module.exports = {
  createForwarder,
};
