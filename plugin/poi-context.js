'use strict';

const { readStorePath, toPlain } = require('./lib/plain');

function firstNonEmpty(...values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function normalizePlayer(input) {
  if (!input || typeof input !== 'object') return null;
  const memberId = firstNonEmpty(input.api_member_id, input.memberId);
  // POI info.basic comes from api_port/port api_basic, which uses api_nickname.
  // api_get_member/basic historically used api_member_nickname.
  const nickname = firstNonEmpty(
    input.api_member_nickname,
    input.api_nickname,
    input.memberNickname,
    input.nickname,
  );
  if (memberId == null && nickname == null) return null;
  return {
    api_member_id: memberId,
    api_member_nickname: nickname != null ? String(nickname) : null,
  };
}

function readPlayerIdentity(getStore) {
  const basic = toPlain(readStorePath(getStore, 'info.basic')) || {};
  // Prefer direct path reads in case Immutable/proxy objects skip some keys in toJS.
  const memberId = firstNonEmpty(
    basic.api_member_id,
    readStorePath(getStore, 'info.basic.api_member_id'),
  );
  const nickname = firstNonEmpty(
    basic.api_member_nickname,
    basic.api_nickname,
    readStorePath(getStore, 'info.basic.api_member_nickname'),
    readStorePath(getStore, 'info.basic.api_nickname'),
  );
  return normalizePlayer({
    api_member_id: memberId,
    api_member_nickname: nickname,
    api_nickname: nickname,
  });
}

function readBasic(getStore, player) {
  const basicRaw = toPlain(readStorePath(getStore, 'info.basic')) || {};
  return {
    api_member_id: player ? player.api_member_id : (basicRaw.api_member_id || null),
    api_member_nickname: player ? player.api_member_nickname : null,
    api_nickname: firstNonEmpty(basicRaw.api_nickname, player && player.api_member_nickname),
    api_level: basicRaw.api_level != null ? basicRaw.api_level : null,
    api_nickname_id: firstNonEmpty(basicRaw.api_nickname_id, basicRaw.api_member_nickname_id),
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function pickById(collection, id) {
  if (!collection || id == null || id === '' || Number(id) <= 0) return null;
  return collection[id]
    || collection[String(id)]
    || collection[Number(id)]
    || null;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fleetList(fleets) {
  if (Array.isArray(fleets)) return fleets.map((fleet, index) => ({ fleet, index }));
  if (fleets && typeof fleets === 'object') {
    return Object.keys(fleets).map((key, index) => ({
      fleet: fleets[key],
      index,
      key,
    }));
  }
  return [];
}

function fleetDeckId(entry) {
  const fleet = entry && entry.fleet;
  const explicit = toNumber(fleet && (fleet.api_id != null ? fleet.api_id : fleet.id), null);
  if (explicit != null) return explicit;
  if (entry && entry.key != null && /^\d+$/.test(String(entry.key))) {
    return Number(entry.key);
  }
  return (entry && entry.index != null ? entry.index : 0) + 1;
}

function fleetShipIds(fleet) {
  return asArray(fleet && (fleet.api_ship || fleet.ships))
    .map((id) => toNumber(id, null))
    .filter((id) => id != null && id > 0);
}

function extractSupportDeckId(response) {
  const apiData = response && (response.api_data || response.data || response);
  const supportInfo = apiData && apiData.api_support_info;
  if (!supportInfo) return null;
  const sources = [
    supportInfo.api_support_airatack,
    supportInfo.api_support_hourai,
    supportInfo,
  ];
  for (let index = 0; index < sources.length; index += 1) {
    const value = sources[index] && sources[index].api_deck_id;
    const deckId = toNumber(value, null);
    if (deckId != null && deckId > 0) return deckId;
  }
  return null;
}

function resolveBattleDeckIds(options) {
  const opts = options || {};
  const deckIds = new Set();
  const mainDeckId = toNumber(opts.deckId, 1) || 1;
  deckIds.add(mainDeckId);

  const path = String(opts.path || '');
  const combined = Boolean(opts.combined)
    || path.includes('combined_battle')
    || path.includes('combined');
  if (combined) {
    deckIds.add(2);
  }

  const supportDeckId = toNumber(opts.supportDeckId, null);
  if (supportDeckId != null && supportDeckId > 0) {
    deckIds.add(supportDeckId);
  } else {
    const fromResponse = extractSupportDeckId(opts.response);
    if (fromResponse != null) deckIds.add(fromResponse);
  }

  return Array.from(deckIds).sort((left, right) => left - right);
}

function collectEquipsForShip(ship, allEquips, outEquips) {
  if (!ship || !allEquips) return;
  const slotIds = []
    .concat(asArray(ship.api_slot), asArray(ship.api_slot_ex), asArray(ship.slot), asArray(ship.ex_slot))
    .map((id) => toNumber(id, null))
    .filter((id) => id != null && id > 0);
  slotIds.forEach((equipId) => {
    const key = String(equipId);
    if (outEquips[key]) return;
    const equip = pickById(allEquips, equipId);
    if (equip) outEquips[key] = equip;
  });
}

function filterPortForDecks(ships, equips, fleets, deckIds) {
  const wanted = new Set((deckIds || []).map((id) => Number(id)));
  const filteredFleets = {};
  const filteredShips = {};
  const filteredEquips = {};
  const shipIds = new Set();

  fleetList(fleets).forEach((entry) => {
    const deckId = fleetDeckId(entry);
    if (!wanted.has(deckId)) return;
    filteredFleets[String(deckId)] = entry.fleet;
    fleetShipIds(entry.fleet).forEach((shipId) => shipIds.add(shipId));
  });

  shipIds.forEach((shipId) => {
    const ship = pickById(ships, shipId);
    if (!ship) return;
    filteredShips[String(shipId)] = ship;
    collectEquipsForShip(ship, equips, filteredEquips);
  });

  return {
    ships: filteredShips,
    equips: filteredEquips,
    fleets: filteredFleets,
    deckIds: Array.from(wanted).sort((left, right) => left - right),
  };
}

function buildPoiContext(getStore) {
  const player = readPlayerIdentity(getStore);
  return {
    revision: Date.now(),
    capturedAt: new Date().toISOString(),
    player,
    basic: readBasic(getStore, player),
    ships: toPlain(readStorePath(getStore, 'info.ships')),
    equips: toPlain(readStorePath(getStore, 'info.equips')),
    fleets: toPlain(readStorePath(getStore, 'info.fleets')),
    masterShips: toPlain(readStorePath(getStore, 'const.$ships')),
    masterEquips: toPlain(readStorePath(getStore, 'const.$equips')),
  };
}

/**
 * Battle/map scoped port snapshot: only sortie (+ escort / support) decks.
 * Master tables are omitted; they should be uploaded separately and cached.
 */
function buildBattlePoiContext(getStore, options) {
  const player = readPlayerIdentity(getStore);
  const ships = toPlain(readStorePath(getStore, 'info.ships')) || {};
  const equips = toPlain(readStorePath(getStore, 'info.equips')) || {};
  const fleets = toPlain(readStorePath(getStore, 'info.fleets')) || {};
  const deckIds = resolveBattleDeckIds(options);
  const filtered = filterPortForDecks(ships, equips, fleets, deckIds);

  return {
    revision: Date.now(),
    capturedAt: new Date().toISOString(),
    scope: 'battle',
    deckIds: filtered.deckIds,
    player,
    basic: readBasic(getStore, player),
    ships: filtered.ships,
    equips: filtered.equips,
    fleets: filtered.fleets,
  };
}

/**
 * Game-wide master tables shared across players/sessions.
 */
function buildMasterDataPayload(getStore) {
  const player = readPlayerIdentity(getStore);
  return {
    revision: Date.now(),
    capturedAt: new Date().toISOString(),
    player,
    masterShips: toPlain(readStorePath(getStore, 'const.$ships')) || {},
    masterEquips: toPlain(readStorePath(getStore, 'const.$equips')) || {},
  };
}

function stripMasterFromContext(context) {
  if (!context || typeof context !== 'object') return context;
  const next = Object.assign({}, context);
  delete next.masterShips;
  delete next.masterEquips;
  delete next.mst_ships;
  delete next.mst_equips;
  delete next.mstShips;
  delete next.mstSlotitems;
  delete next.mstSlotItems;
  return next;
}

function extractMasterFromContext(context) {
  if (!context || typeof context !== 'object') return null;
  const masterShips = context.masterShips || context.mst_ships || context.mstShips || null;
  const masterEquips = context.masterEquips || context.mst_equips
    || context.mstSlotitems || context.mstSlotItems || null;
  if (!masterShips && !masterEquips) return null;
  return {
    revision: context.revision || Date.now(),
    capturedAt: context.capturedAt || new Date().toISOString(),
    player: context.player || null,
    masterShips: masterShips || {},
    masterEquips: masterEquips || {},
  };
}

module.exports = {
  buildBattlePoiContext,
  buildMasterDataPayload,
  buildPoiContext,
  extractMasterFromContext,
  extractSupportDeckId,
  filterPortForDecks,
  normalizePlayer,
  readPlayerIdentity,
  resolveBattleDeckIds,
  stripMasterFromContext,
};
