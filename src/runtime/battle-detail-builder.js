'use strict';

const { isBattleApiPath, isBattleResultApiPath } = require('../collectors/battle-api-paths');
const { normalizeEnemyMasterShip } = require('../port/enemy-master');

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstDefined() {
  for (let index = 0; index < arguments.length; index += 1) {
    if (arguments[index] !== undefined && arguments[index] !== null) return arguments[index];
  }
  return undefined;
}

function normalizeApiPath(path) {
  if (!path) return '';
  const text = String(path);
  const queryIndex = text.indexOf('?');
  return queryIndex === -1 ? text : text.slice(0, queryIndex);
}

function clonePlain(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function toPlain(value) {
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toJS === 'function') {
    try {
      return value.toJS();
    } catch (error) {
      return value;
    }
  }
  return value;
}

function readPath(source, path) {
  if (!source) return undefined;
  if (typeof source === 'function') {
    try {
      return toPlain(source(path));
    } catch (error) {
      try {
        return toPlain(source(Array.isArray(path) ? path.join('.') : path));
      } catch (innerError) {
        return undefined;
      }
    }
  }
  const parts = Array.isArray(path) ? path : String(path).split('.');
  return parts.reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    if (current && typeof current.get === 'function') {
      const value = current.get(key);
      if (value !== undefined) return toPlain(value);
    }
    return toPlain(current[key]);
  }, toPlain(source));
}

function getName(value, fallback) {
  const raw = toPlain(value);
  return raw && (raw.api_name || raw.name || raw.api_yomi) || fallback || null;
}

function normalizeItem(raw) {
  if (!raw || !raw.api_id) return null;
  const readStat = (keys, fallbackKey) => {
    for (let index = 0; index < keys.length; index += 1) {
      const value = raw[keys[index]];
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) return toNumber(value[0], 0);
      return toNumber(value, 0);
    }
    if (fallbackKey && raw[fallbackKey] !== undefined) return toNumber(raw[fallbackKey], 0);
    return 0;
  };
  const stats = {
    fire: readStat(['api_houg'], 'fire'),
    torpedo: readStat(['api_raig'], 'torpedo'),
    aa: readStat(['api_tyku'], 'aa'),
    bomber: readStat(['api_baku'], 'bomber'),
    asw: readStat(['api_tais'], 'asw'),
    armor: readStat(['api_souk'], 'armor'),
    evasion: readStat(['api_houk'], 'evasion'),
    los: readStat(['api_saku'], 'los'),
    accuracy: readStat(['api_houm'], 'accuracy'),
    range: readStat(['api_leng'], 'range'),
    radius: readStat(['api_distance'], 'radius'),
  };
  return {
    id: raw.api_id,
    masterId: raw.api_slotitem_id || raw.masterId || null,
    name: getName(raw, raw.api_slotitem_id ? `装备#${raw.api_slotitem_id}` : null),
    type: raw.api_type || raw.type || null,
    specialType: Array.isArray(raw.api_type)
      ? toNumber(raw.api_type[4], 0)
      : toNumber(raw.specialType || raw.special_type, 0),
    level: raw.api_level === undefined ? null : raw.api_level,
    aircraftLevel: raw.api_alv === undefined ? null : raw.api_alv,
    improvement: raw.api_level === undefined ? null : raw.api_level,
    proficiency: raw.api_alv === undefined ? null : raw.api_alv,
    stats,
    raw,
  };
}

function normalizeFriendlyShip(raw, position) {
  if (!raw || !raw.api_id) return null;
  const params = computeFriendlyParams(raw);
  return {
    side: 'friendly',
    position,
    id: raw.api_id,
    masterId: raw.api_ship_id || null,
    stype: raw.api_stype === undefined ? null : toNumber(raw.api_stype, null),
    api_stype: raw.api_stype === undefined ? null : toNumber(raw.api_stype, null),
    ctype: raw.api_ctype === undefined ? null : toNumber(raw.api_ctype, null),
    yomi: raw.api_yomi || raw.yomi || null,
    name: getName(raw, raw.api_ship_id ? `我方#${raw.api_ship_id}` : `我方${position + 1}`),
    level: raw.api_lv === undefined ? null : raw.api_lv,
    hp: {
      now: raw.api_nowhp === undefined ? null : raw.api_nowhp,
      max: raw.api_maxhp === undefined ? null : raw.api_maxhp,
    },
    fuel: {
      now: raw.api_fuel === undefined ? null : raw.api_fuel,
      max: raw.api_fuel_max === undefined ? null : raw.api_fuel_max,
    },
    ammo: {
      now: raw.api_bull === undefined ? null : raw.api_bull,
      max: raw.api_bull_max === undefined ? null : raw.api_bull_max,
    },
    condition: raw.api_cond === undefined ? null : raw.api_cond,
    baseParam: params.baseParam,
    finalParam: params.finalParam,
    stats: params.stats,
    fire: params.stats.fire,
    torpedo: params.stats.torpedo,
    armor: params.stats.armor,
    aa: params.stats.aa,
    displayedAsw: Array.isArray(raw.api_taisen)
      ? toNumber(raw.api_taisen[0], null)
      : toNumber(raw.api_taisen, null),
    specialEffects: asArray(raw.api_sp_effect_items).map((item) => ({
      type: item && item.api_kind,
      fire: toNumber(item && item.api_houg, 0),
      torpedo: toNumber(item && item.api_raig, 0),
      armor: toNumber(item && item.api_souk, 0),
      evasion: toNumber(item && item.api_kaih, 0),
    })),
    slotCounts: asArray(raw.api_onslot || raw.api_maxeq).map((count) => toNumber(count, 0)),
    slots: asArray(raw.poi_slot).map(normalizeItem).filter(Boolean),
    exSlot: normalizeItem(raw.poi_slot_ex),
    raw,
  };
}

function normalizeEquipmentMasterIds(values) {
  return asArray(values)
    .filter((id) => id !== -1 && id !== null && id !== undefined)
    .map((id) => toNumber(id, null))
    .filter((id) => id !== null && id > 0);
}

function readParamArray(value, fallback) {
  const list = asArray(value);
  if (list.length < 4) {
    return (fallback || [0, 0, 0, 0]).slice();
  }
  return [
    toNumber(list[0], 0),
    toNumber(list[1], 0),
    toNumber(list[2], 0),
    toNumber(list[3], 0),
  ];
}

function readEquipStat(item, keys) {
  const raw = item || {};
  for (let index = 0; index < keys.length; index += 1) {
    const value = raw[keys[index]];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) return toNumber(value[0], 0);
    return toNumber(value, 0);
  }
  return 0;
}

function computeEnemyFinalParam(baseParam, slotIds, getMasterItem) {
  const bonus = readParamArray(baseParam);
  return asArray(slotIds).reduce((result, slotId) => {
    const id = toNumber(slotId, null);
    if (id === null || id <= 0) return result;
    const item = getMasterItem ? getMasterItem(id) : null;
    return [
      result[0] + readEquipStat(item, ['api_houg', 'houg']),
      result[1] + readEquipStat(item, ['api_raig', 'raig']),
      result[2] + readEquipStat(item, ['api_tyku', 'tyku']),
      result[3] + readEquipStat(item, ['api_souk', 'souk']),
    ];
  }, bonus);
}

function paramsToStats(param) {
  const list = readParamArray(param);
  return {
    fire: list[0],
    torpedo: list[1],
    aa: list[2],
    armor: list[3],
  };
}

function computeFriendlyParams(raw) {
  const source = raw || {};
  const kyouka = asArray(source.api_kyouka);
  const baseParam = [
    toNumber(asArray(source.api_houg)[0], 0) + toNumber(kyouka[0], 0),
    toNumber(asArray(source.api_raig)[0], 0) + toNumber(kyouka[1], 0),
    toNumber(asArray(source.api_tyku)[0], 0) + toNumber(kyouka[2], 0),
    toNumber(asArray(source.api_souk)[0], 0) + toNumber(kyouka[3], 0),
  ];
  const finalParam = [
    firstDefined(toNumber(asArray(source.api_karyoku)[0], null), baseParam[0]),
    firstDefined(toNumber(asArray(source.api_raisou)[0], null), baseParam[1]),
    firstDefined(toNumber(asArray(source.api_taiku)[0], null), baseParam[2]),
    firstDefined(toNumber(asArray(source.api_soukou)[0], null), baseParam[3]),
  ];
  return {
    baseParam,
    finalParam,
    stats: paramsToStats(finalParam),
  };
}

function readHpListValue(values, index) {
  const list = asArray(values);
  if (index < 0 || index >= list.length) return null;
  const hp = toNumber(list[index], null);
  return hp !== null && hp >= 0 ? hp : null;
}

function readEnemyHpValue(values, position, sourceIndex, shipIds) {
  const list = asArray(values);
  if (!list.length) return null;
  if (list.length > 7 + position) return readHpListValue(list, 7 + position);
  if (list.length === shipIds.length) return readHpListValue(list, sourceIndex);
  if (toNumber(list[0], null) <= 0 && list.length > position + 1) return readHpListValue(list, position + 1);
  if (list.length >= 7) return readHpListValue(list, position + 1);
  return readHpListValue(list, position);
}

function readMasterShipFromStore(masterId, getStore) {
  if (!getStore) return null;
  const id = String(masterId);
  const chunks = [
    readPath(getStore, ['const', '$ships', id]),
    readPath(getStore, `const.$ships.${id}`),
    readPath(getStore, ['info', 'mst_ships', id]),
    readPath(getStore, ['info', 'mstShips', id]),
    readPath(getStore, ['const', 'ships', id]),
  ].map(toPlain).filter(Boolean);
  if (!chunks.length) return null;
  return Object.assign({}, ...chunks);
}

function readMasterItemFromStore(masterId, getStore) {
  if (!getStore) return null;
  const id = String(masterId);
  const chunks = [
    readPath(getStore, ['const', '$equips', id]),
    readPath(getStore, `const.$equips.${id}`),
    readPath(getStore, ['const', '$slotitems', id]),
    readPath(getStore, `const.$slotitems.${id}`),
    readPath(getStore, ['info', 'mst_slotitems', id]),
    readPath(getStore, ['info', 'mstSlotitems', id]),
  ].map(toPlain).filter(Boolean);
  if (!chunks.length) return null;
  return Object.assign({}, ...chunks);
}

function buildEnemyResource(master, nowKey, maxKey) {
  const raw = master || {};
  const readValue = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (Array.isArray(value)) return toNumber(value[0], null);
    return toNumber(value, null);
  };
  const nowAliases = nowKey === 'api_fuel'
    ? ['api_fuel', 'fuel']
    : ['api_bull', 'bull', 'ammo', 'api_ammo'];
  const maxAliases = maxKey === 'api_fuel_max'
    ? ['api_fuel_max', 'fuel_max', 'fuelMax']
    : ['api_bull_max', 'bull_max', 'ammo_max', 'ammoMax'];
  const max = readValue(firstDefined.apply(null, maxAliases.map((key) => raw[key])));
  const now = firstDefined(
    readValue(firstDefined.apply(null, nowAliases.map((key) => raw[key]))),
    max
  );
  return { now, max };
}

function hasResourceValue(resource) {
  if (!resource || typeof resource !== 'object') return false;
  return (resource.now !== null && resource.now !== undefined)
    || (resource.max !== null && resource.max !== undefined);
}

function mergeShipResource(existing, fallback) {
  return hasResourceValue(existing) ? existing : fallback;
}

function normalizeRangeStat(value) {
  if (Array.isArray(value)) return toNumber(value[0], null);
  return toNumber(value, null);
}

function readEnemyHpFields(ship, master) {
  const source = Object.assign({}, master || {}, ship && ship.raw || {});
  const normalizeHpValue = (value) => {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return normalizeRangeStat(value);
    if (typeof value === 'object') return null;
    return toNumber(value, null);
  };
  if (ship && ship.hp && typeof ship.hp === 'object') {
    return {
      now: normalizeHpValue(ship.hp.now),
      max: firstDefined(
        normalizeHpValue(ship.hp.max),
        normalizeRangeStat(firstDefined(source.api_taik, source.taik, source.maxHp))
      ),
    };
  }
  if (ship && typeof ship.hp === 'number') {
    return {
      now: ship.hp,
      max: firstDefined(
        normalizeHpValue(ship.maxHp),
        normalizeRangeStat(source.api_taik)
      ),
    };
  }
  return {
    now: firstDefined(ship && ship.nowHp, null),
    max: firstDefined(
      ship && ship.maxHp,
      normalizeRangeStat(firstDefined(source.api_taik, source.taik, source.hp, source.maxHp))
    ),
  };
}

function buildEnemyShipDisplayFields(ship, master) {
  const source = Object.assign({}, master || {}, ship && ship.raw || {});
  return {
    hp: readEnemyHpFields(ship, master),
    fuel: mergeShipResource(
      ship && ship.fuel,
      buildEnemyResource(source, 'api_fuel', 'api_fuel_max')
    ),
    ammo: mergeShipResource(
      ship && ship.ammo,
      buildEnemyResource(source, 'api_bull', 'api_bull_max')
    ),
  };
}

function buildEnemyShipStatsFromMaster(ship, master) {
  const normalized = normalizeEnemyMasterShip(Object.assign({}, master, ship && ship.raw, ship, {
    id: ship && (ship.masterId || ship.id),
    masterId: ship && (ship.masterId || ship.id),
  }));
  if (!normalized) {
    return {
      fire: firstDefined(ship && ship.stats && ship.stats.fire, ship && ship.fire),
      torpedo: firstDefined(ship && ship.stats && ship.stats.torpedo, ship && ship.torpedo),
      armor: firstDefined(ship && ship.stats && ship.stats.armor, ship && ship.armor),
      aa: firstDefined(ship && ship.stats && ship.stats.aa, ship && ship.aa),
    };
  }
  return {
    fire: firstDefined(ship && ship.stats && ship.stats.fire, normalized.fire),
    torpedo: firstDefined(ship && ship.stats && ship.stats.torpedo, normalized.torpedo),
    armor: firstDefined(ship && ship.stats && ship.stats.armor, normalized.armor),
    aa: firstDefined(ship && ship.stats && ship.stats.aa, normalized.aa),
  };
}

function resolveEnemyShipSlots(ship, getStore) {
  const equipmentMasterIds = asArray(ship && ship.equipmentMasterIds);
  if (equipmentMasterIds.length) {
    const existing = asArray(ship && ship.slots).filter((entry) => (
      entry && typeof entry === 'object'
    ));
    return equipmentMasterIds.map((masterId) => {
      const cached = existing.find((entry) => Number(entry.masterId) === Number(masterId));
      if (cached && cached.name) return cached;
      const item = readMasterItemFromStore(masterId, getStore) || {};
      return {
        id: null,
        masterId,
        name: getName(item, `装备#${masterId}`),
        raw: Object.assign({}, item, cached && cached.raw || {}),
      };
    });
  }
  const existing = asArray(ship && ship.slots).filter((entry) => (
    entry && typeof entry === 'object' && (entry.name || entry.masterId)
  ));
  if (existing.length) {
    return existing.map((entry) => {
      if (entry.name || !entry.masterId) return entry;
      const item = readMasterItemFromStore(entry.masterId, getStore) || {};
      return Object.assign({}, entry, {
        name: getName(item, `装备#${entry.masterId}`),
        raw: Object.assign({}, item, entry.raw || {}),
      });
    });
  }
  return [];
}

function enrichEnemyShipForDisplay(ship, getStore) {
  if (!ship) return ship;
  const masterId = ship.masterId || ship.id;
  const liveMaster = readMasterShipFromStore(masterId, getStore) || {};
  const master = Object.assign({}, ship.raw || {}, liveMaster);
  const normalized = normalizeEnemyMasterShip(Object.assign({}, master, {
    id: masterId,
    masterId,
  }));
  const hasPacketParams = Array.isArray(ship.finalParam) || Array.isArray(ship.baseParam);
  const stats = hasPacketParams
    ? paramsToStats(ship.finalParam || ship.baseParam)
    : buildEnemyShipStatsFromMaster(ship, master);
  const displayFields = buildEnemyShipDisplayFields(ship, master);
  const slots = resolveEnemyShipSlots(ship, getStore);
  const equipmentMasterIds = asArray(ship.equipmentMasterIds).length
    ? asArray(ship.equipmentMasterIds)
    : slots.map((entry) => entry.masterId).filter(Boolean);
  return Object.assign({}, ship, {
    name: getName(master, null) || (normalized && normalized.name) || ship.name,
    type: normalized && normalized.type,
    stype: normalized && normalized.stype,
    stats,
    fire: stats.fire,
    torpedo: stats.torpedo,
    armor: stats.armor,
    aa: stats.aa,
    baseParam: ship.baseParam,
    finalParam: ship.finalParam,
    hp: displayFields.hp,
    fuel: displayFields.fuel,
    ammo: displayFields.ammo,
    slots,
    equipmentMasterIds,
    raw: Object.assign({}, master, ship.raw || {}),
  });
}

function enrichEnemyFleetForDisplay(fleet, getStore) {
  return asArray(fleet).map((ship) => enrichEnemyShipForDisplay(ship, getStore));
}

function normalizeEnemyFleetSide(ids, levels, equipmentLists, nowHps, maxHps, getMasterShip, getMasterItem, paramLists) {
  const shipIds = asArray(ids);
  const levelList = asArray(levels);
  const equipmentList = asArray(equipmentLists);
  const enemyParams = asArray(paramLists);
  const hasSentinel = shipIds.length > 0 && toNumber(shipIds[0], null) <= 0;

  return shipIds
    .map((masterId, index) => {
      const id = toNumber(masterId, null);
      const position = hasSentinel ? index - 1 : index;
      if (position < 0 || id === null || id <= 0) return null;
      const master = toPlain(getMasterShip(id)) || {};
      const equipmentIndex = equipmentList.length === shipIds.length ? index : position;
      const slotRow = equipmentList[equipmentIndex];
      const equipmentMasterIds = normalizeEquipmentMasterIds(slotRow);
      const maxHp = readEnemyHpValue(maxHps, position, index, shipIds)
        || normalizeRangeStat(firstDefined(master.api_taik, master.taik, master.hp, master.maxHp));
      const packetBaseParam = enemyParams.length ? enemyParams[index] : null;
      const baseParam = packetBaseParam !== undefined && packetBaseParam !== null
        ? readParamArray(packetBaseParam)
        : null;
      const finalParam = baseParam
        ? computeEnemyFinalParam(baseParam, asArray(slotRow), getMasterItem)
        : null;
      const stats = finalParam
        ? paramsToStats(finalParam)
        : buildEnemyShipStatsFromMaster({ id, masterId: id, raw: master }, master);
      const displayFields = buildEnemyShipDisplayFields({
        hp: {
          now: readEnemyHpValue(nowHps, position, index, shipIds),
          max: maxHp,
        },
      }, master);
      return {
        side: 'enemy',
        position,
        id,
        masterId: id,
        name: getName(master, `敌方${position + 1} #${id}`),
        level: toNumber(levelList[index], null),
        hp: displayFields.hp,
        fuel: displayFields.fuel,
        ammo: displayFields.ammo,
        baseParam: baseParam || undefined,
        finalParam: finalParam || undefined,
        stats,
        fire: stats.fire,
        torpedo: stats.torpedo,
        armor: stats.armor,
        aa: stats.aa,
        slots: equipmentMasterIds.map((itemId) => {
          const item = getMasterItem(itemId) || {};
          return {
            id: null,
            masterId: itemId,
            name: getName(item, `装备#${itemId}`),
            raw: item,
          };
        }),
        equipmentMasterIds,
        raw: master,
      };
    })
    .filter(Boolean);
}

class BattleDetailBuilder {
  constructor(options) {
    this.getStore = options && options.getStore;
    this.fleetType = 0;
    this.current = null;
  }

  reset() {
    this.fleetType = 0;
    this.current = null;
  }

  finishBattle() {
    this.current = null;
  }

  read(path) {
    return readPath(this.getStore, path);
  }

  getItem(itemId) {
    const id = toNumber(itemId, null);
    if (id === null || id <= 0) return null;
    const infoItem = this.read(['info', 'equips', String(id)])
      || this.read(['info', 'slotitems', String(id)])
      || this.read(`info.equips.${id}`)
      || this.read(`info.slotitems.${id}`);
    if (!infoItem) return null;
    const masterId = infoItem.api_slotitem_id || infoItem.masterId || infoItem.itemId;
    const master = masterId
      ? this.read(['const', '$equips', String(masterId)]) || this.read(`const.$equips.${masterId}`) || {}
      : {};
    return Object.assign({}, master, infoItem);
  }

  getShip(shipId) {
    const id = toNumber(shipId, null);
    if (id === null || id <= 0) return null;
    const ship = Object.assign(
      {},
      this.read(['info', 'ships', String(id)]) || this.read(`info.ships.${id}`) || {}
    );
    if (!ship.api_id) return null;
    const masterId = ship.api_ship_id || ship.masterId || ship.shipId;
    const master = masterId
      ? this.read(['const', '$ships', String(masterId)]) || this.read(`const.$ships.${masterId}`) || {}
      : {};
    const merged = Object.assign({}, master, ship);
    merged.poi_slot = asArray(ship.api_slot || ship.slot)
      .map((itemId) => this.getItem(itemId))
      .filter(Boolean);
    merged.poi_slot_ex = this.getItem(ship.api_slot_ex || ship.exSlot);
    return merged;
  }

  getFleet(deckId) {
    const id = toNumber(deckId, null);
    if (id === null || id <= 0) return [];
    const deck = this.read(['info', 'fleets', String(id - 1)])
      || this.read(`info.fleets.${id - 1}`)
      || {};
    return asArray(deck.api_ship || deck.ships)
      .map((shipId, index) => normalizeFriendlyShip(this.getShip(shipId), index))
      .filter(Boolean);
  }

  getMasterShip(masterId) {
    return readMasterShipFromStore(masterId, this.getStore);
  }

  getMasterItem(masterId) {
    return readMasterItemFromStore(masterId, this.getStore);
  }

  makeEnemyFleet(packet) {
    return buildEnemyFleetFromPacket(
      packet,
      (id) => this.getMasterShip(id),
      (id) => this.getMasterItem(id)
    );
  }

  hasEnemyFleetPayload(packet) {
    return hasEnemyFleetPayload(packet);
  }

  makeSnapshot(battle, latestPath) {
    return clonePlain({
      type: battle.type,
      map: battle.map || [],
      desc: battle.desc,
      time: battle.time,
      fleet: battle.fleet ? {
        type: battle.fleet.type,
        main: asArray(battle.fleet.main),
        escort: asArray(battle.fleet.escort),
      } : null,
      enemyFleet: battle.enemyFleet ? {
        main: asArray(battle.enemyFleet.main),
        escort: asArray(battle.enemyFleet.escort),
      } : null,
      packet: asArray(battle.packet),
      latestPath,
    });
  }

  createShell(path, request, body, timestamp) {
    const isBoss = toNumber(body && body.api_event_id, null) === 5;
    this.current = {
      type: isBoss ? 'Boss' : 'Normal',
      map: [
        toNumber((body && body.api_maparea_id) || (request && request.api_maparea_id), null),
        toNumber((body && body.api_mapinfo_no) || (request && request.api_mapinfo_no) || (request && request.api_map_no), null),
        toNumber((body && (body.api_no || body.api_cell_no)) || (request && request.api_no), null),
      ],
      desc: null,
      time: timestamp,
      fleet: null,
      enemyFleet: null,
      packet: [],
      rawStart: {
        path,
        request: Object.assign({}, request || {}),
        response: body || {},
      },
    };
    return this.current;
  }

  ensureShell(path, request, body, timestamp) {
    if (!this.current) {
      this.current = {
        type: normalizeApiPath(path).indexOf('/practice/') !== -1 ? 'Practice' : 'Normal',
        map: [
          toNumber((request && request.api_maparea_id) || (body && body.api_maparea_id), null),
          toNumber((request && request.api_mapinfo_no) || (body && body.api_mapinfo_no), null),
          toNumber((request && request.api_no) || (body && body.api_no), null),
        ],
        desc: null,
        time: timestamp,
        fleet: null,
        enemyFleet: null,
        packet: [],
        rawStart: null,
      };
    }
    return this.current;
  }

  attachFleet(body, request) {
    if (!this.current || this.current.fleet) return;
    const deckId = [body && body.api_deck_id, body && body.api_dock_id, request && request.api_deck_id]
      .find((value) => value !== undefined && value !== null);
    const fleetType = toNumber(this.fleetType, 0);
    this.current.fleet = {
      type: fleetType,
      main: this.getFleet(deckId || 1),
      escort: fleetType > 0 ? this.getFleet(2) : [],
    };
  }

  handleGameResponse(detail) {
    if (!detail || !detail.path) return null;
    const path = normalizeApiPath(detail.path);
    const body = detail.body || detail.response || detail.payload || {};
    const request = detail.postBody || detail.request || detail.params || {};
    const timestamp = detail.time || detail.timestamp || Date.now();

    if (path === '/kcsapi/api_port/port' || path === '/kcsapi/api_start2/getData') {
      this.fleetType = toNumber(body && body.api_combined_flag, 0);
      this.current = null;
      return null;
    }

    if (path === '/kcsapi/api_req_map/start') {
      const deckId = toNumber(request && request.api_deck_id, 1);
      if (this.fleetType !== 0 && deckId !== 1) this.fleetType = 0;
    }

    if (path === '/kcsapi/api_req_map/start' || path === '/kcsapi/api_req_map/next'
      || path === '/kcsapi/api_req_map/air_raid') {
      return this.createShell(path, request, body, timestamp);
    }

    if (path === '/kcsapi/api_req_practice/battle') {
      this.fleetType = 0;
      this.createShell(path, request, body, timestamp);
      this.current.type = 'Practice';
    }

    if (!isBattleApiPath(path) && !isBattleResultApiPath(path)) return null;

    const battle = this.ensureShell(path, request, body, timestamp);
    const apiData = unwrapApiData(body);
    const packet = Object.assign({}, apiData, {
      poi_path: path,
      poi_time: timestamp,
    });
    if (!battle.time) battle.time = timestamp;
    this.attachFleet(body, request);
    if (this.hasEnemyFleetPayload(packet)) {
      battle.enemyFleet = this.makeEnemyFleet(packet);
    }
    // Always overlay this stage's packet HP so night entry HP (after day damage)
    // is reflected on both enemy and friendly fleet snapshots.
    applyPacketHpToBattleFleets(battle, packet);
    battle.packet.push(packet);

    const snapshot = this.makeSnapshot(battle, path);

    if (isBattleResultApiPath(path)) this.current = null;
    return snapshot;
  }
}

function unwrapApiData(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.api_data || payload.data || payload;
}

function hasEnemyFleetPayload(packet) {
  return Boolean(packet && (
    packet.api_ship_ke !== undefined
    || packet.api_ship_ke_combined !== undefined
    || packet.api_eSlot !== undefined
    || packet.api_eSlot_combined !== undefined
  ));
}

function buildEnemyFleetFromPacket(packet, getMasterShip, getMasterItem) {
  const data = unwrapApiData(packet);
  return {
    main: normalizeEnemyFleetSide(
      data && data.api_ship_ke,
      data && data.api_ship_lv,
      data && data.api_eSlot,
      data && (data.api_e_nowhps || data.api_nowhps),
      data && (data.api_e_maxhps || data.api_maxhps),
      getMasterShip,
      getMasterItem,
      data && data.api_eParam
    ),
    escort: normalizeEnemyFleetSide(
      data && data.api_ship_ke_combined,
      data && data.api_ship_lv_combined,
      data && data.api_eSlot_combined,
      data && (data.api_e_nowhps_combined || data.api_nowhps_combined),
      data && (data.api_e_maxhps_combined || data.api_maxhps_combined),
      getMasterShip,
      getMasterItem,
      data && data.api_eParam_combined
    ),
  };
}

function findEnemyFleetPacket(record, options) {
  const mode = options && options.mode ? options.mode : 'current';
  const preferFirst = mode === 'start' || mode === 'first';
  const current = unwrapApiData(record && record.raw && record.raw.response);

  if (!preferFirst && hasEnemyFleetPayload(current)) {
    return current;
  }

  const packets = asArray(record && record.battleDetail && record.battleDetail.packet);
  if (packets.length) {
    const indices = preferFirst
      ? [...Array(packets.length).keys()]
      : [...Array(packets.length).keys()].reverse();
    for (let step = 0; step < indices.length; step += 1) {
      const packet = unwrapApiData(packets[indices[step]]);
      if (hasEnemyFleetPayload(packet)) return packet;
    }
  }

  return null;
}

function slimEnemyFleetFromDetail(enemyFleet) {
  const toEntry = (ship) => ({
    position: ship.position,
    id: ship.masterId || ship.id,
    equipmentMasterIds: asArray(ship.equipmentMasterIds),
  });
  return {
    main: asArray(enemyFleet && enemyFleet.main).map(toEntry),
    escort: asArray(enemyFleet && enemyFleet.escort).map(toEntry),
  };
}

function readEnemyHpFromPacketData(data, position, fleet = 'main') {
  const packet = unwrapApiData(data);
  if (!packet) return null;
  const shipIds = asArray(fleet === 'escort' ? packet.api_ship_ke_combined : packet.api_ship_ke);
  if (!shipIds.length) return null;
  const nowHps = fleet === 'escort'
    ? (packet.api_e_nowhps_combined || packet.api_nowhps_combined)
    : (packet.api_e_nowhps || packet.api_nowhps);
  const maxHps = fleet === 'escort'
    ? (packet.api_e_maxhps_combined || packet.api_maxhps_combined)
    : (packet.api_e_maxhps || packet.api_maxhps);
  const key = toNumber(position, null);
  if (key === null || key < 0) return null;
  const hasSentinel = shipIds.length > 0 && toNumber(shipIds[0], null) <= 0;
  const sourceIndex = hasSentinel ? key + 1 : key;
  const now = readEnemyHpValue(nowHps, key, sourceIndex, shipIds);
  const max = readEnemyHpValue(maxHps, key, sourceIndex, shipIds);
  if (now === null && max === null) return null;
  return {
    now: now === null ? max : now,
    max: max === null ? now : max,
  };
}

function readFriendlyHpFromPacketData(data, position, fleet = 'main') {
  const packet = unwrapApiData(data);
  if (!packet) return null;
  const nowHps = fleet === 'escort'
    ? (packet.api_f_nowhps_combined || null)
    : (packet.api_f_nowhps || (
      // When enemy uses dedicated api_e_nowhps, api_nowhps is the friendly side.
      packet.api_e_nowhps != null ? packet.api_nowhps : null
    ));
  const maxHps = fleet === 'escort'
    ? (packet.api_f_maxhps_combined || null)
    : (packet.api_f_maxhps || (
      packet.api_e_maxhps != null ? packet.api_maxhps : null
    ));
  if (nowHps == null && maxHps == null) return null;
  const key = toNumber(position, null);
  if (key === null || key < 0) return null;
  const list = asArray(nowHps != null ? nowHps : maxHps);
  const hasSentinel = list.length > 0 && toNumber(list[0], null) <= 0;
  const sourceIndex = hasSentinel ? key + 1 : key;
  const now = readEnemyHpValue(nowHps, key, sourceIndex, list);
  const max = readEnemyHpValue(maxHps, key, sourceIndex, list);
  if (now === null && max === null) return null;
  return {
    now: now === null ? max : now,
    max: max === null ? now : max,
  };
}

function readCurrentFriendlyHp(record, position, fleet = 'main') {
  const current = unwrapApiData(record && record.raw && record.raw.response);
  if (current) {
    const hp = readFriendlyHpFromPacketData(current, position, fleet);
    if (hp) return hp;
  }
  const packets = asArray(record && record.battleDetail && record.battleDetail.packet);
  for (let index = packets.length - 1; index >= 0; index -= 1) {
    const hp = readFriendlyHpFromPacketData(packets[index], position, fleet);
    if (hp) return hp;
  }
  return null;
}

function readBattleStartEnemyHp(record, position, fleet = 'main') {
  const packets = asArray(record && record.battleDetail && record.battleDetail.packet)
    .map((entry) => unwrapApiData(entry))
    .filter((packet) => hasEnemyFleetPayload(packet));
  for (let index = 0; index < packets.length; index += 1) {
    const hp = readEnemyHpFromPacketData(packets[index], position, fleet);
    if (hp && hp.now === hp.max) return hp;
  }
  return null;
}

function readCurrentEnemyHp(record, position, fleet = 'main') {
  const packet = findEnemyFleetPacket(record, { mode: 'current' });
  if (!packet) return null;
  return readEnemyHpFromPacketData(packet, position, fleet);
}

function applyPacketHpToEnemySide(ships, packet, fleet) {
  return asArray(ships).map((ship) => {
    if (!ship || ship.position === null || ship.position === undefined) return ship;
    const hp = readEnemyHpFromPacketData(packet, ship.position, fleet);
    return hp ? Object.assign({}, ship, { hp }) : ship;
  });
}

function applyPacketHpToFriendlySide(ships, packet, fleet) {
  return asArray(ships).map((ship) => {
    if (!ship || ship.position === null || ship.position === undefined) return ship;
    const hp = readFriendlyHpFromPacketData(packet, ship.position, fleet);
    return hp ? Object.assign({}, ship, { hp }) : ship;
  });
}

/** Overlay current-stage packet HP onto fleet snapshots (day or night entry HP). */
function applyPacketHpToBattleFleets(battle, packet) {
  if (!battle || !packet) return;
  if (battle.enemyFleet) {
    battle.enemyFleet = {
      main: applyPacketHpToEnemySide(battle.enemyFleet.main, packet, 'main'),
      escort: applyPacketHpToEnemySide(battle.enemyFleet.escort, packet, 'escort'),
    };
  }
  if (battle.fleet) {
    battle.fleet = Object.assign({}, battle.fleet, {
      main: applyPacketHpToFriendlySide(battle.fleet.main, packet, 'main'),
      escort: applyPacketHpToFriendlySide(battle.fleet.escort, packet, 'escort'),
    });
  }
}

/**
 * Ensure battleDetail fleet HP matches the current API stage packet.
 * Critical for night battles that inherit day damage via api_e_nowhps / api_f_nowhps.
 */
function syncBattleDetailEntryHp(battleDetail, responseOrPacket) {
  if (!battleDetail || typeof battleDetail !== 'object') return battleDetail;
  const packet = unwrapApiData(responseOrPacket);
  if (!packet || typeof packet !== 'object') return battleDetail;
  const next = Object.assign({}, battleDetail);
  if (next.enemyFleet) {
    next.enemyFleet = {
      main: applyPacketHpToEnemySide(next.enemyFleet.main, packet, 'main'),
      escort: applyPacketHpToEnemySide(next.enemyFleet.escort, packet, 'escort'),
    };
  }
  if (next.fleet) {
    next.fleet = Object.assign({}, next.fleet, {
      main: applyPacketHpToFriendlySide(next.fleet.main, packet, 'main'),
      escort: applyPacketHpToFriendlySide(next.fleet.escort, packet, 'escort'),
    });
  }
  return next;
}

function createMasterGetters(getStore) {
  return {
    getMasterShip(masterId) {
      return readMasterShipFromStore(masterId, getStore);
    },
    getMasterItem(masterId) {
      return readMasterItemFromStore(masterId, getStore);
    },
  };
}

function wrapMasterGettersWithEnemyStats(getters, enemyStatsById) {
  const table = enemyStatsById || {};
  return {
    getMasterShip(masterId) {
      const base = getters.getMasterShip(masterId) || {};
      const enriched = table[masterId] || table[String(masterId)] || {};
      const merged = Object.assign({}, enriched, base);
      return Object.keys(merged).length ? merged : null;
    },
    getMasterItem(masterId) {
      return getters.getMasterItem(masterId);
    },
  };
}

function createMasterGettersFromEnemyStatsById(enemyStatsById) {
  const table = enemyStatsById || {};
  return {
    getMasterShip(masterId) {
      return table[masterId] || table[String(masterId)] || null;
    },
    getMasterItem() {
      return null;
    },
  };
}

function createMasterGettersFromPoiState(poiState) {
  const state = toPlain(poiState) || {};
  return createMasterGetters((path) => readPath(state, path));
}

function resolveMasterGetters(input) {
  const enemyStatsById = input && input.enemyStatsById;
  let getters = null;
  if (input && input.masterGetters) {
    getters = input.masterGetters;
  } else if (input && input.getStore) {
    getters = createMasterGetters(input.getStore);
  } else {
    const poiState = input && (input.poiState || input.enemyMasterData || input.masterData);
    if (poiState) getters = createMasterGettersFromPoiState(poiState);
  }
  if (!getters && enemyStatsById && Object.keys(enemyStatsById).length) {
    getters = createMasterGettersFromEnemyStatsById(enemyStatsById);
  } else if (getters && enemyStatsById && Object.keys(enemyStatsById).length) {
    getters = wrapMasterGettersWithEnemyStats(getters, enemyStatsById);
  }
  return getters;
}

function rebuildRecordEnemyFleet(record, getters) {
  if (!record || !getters) return record;
  const packet = findEnemyFleetPacket(record, { mode: 'current' });
  if (!packet) return record;
  const enemyFleet = buildEnemyFleetFromPacket(
    packet,
    getters.getMasterShip,
    getters.getMasterItem
  );
  const battleDetail = Object.assign({}, record.battleDetail || {}, { enemyFleet });
  return Object.assign({}, record, {
    battleDetail,
    enemyFleet: slimEnemyFleetFromDetail(enemyFleet),
  });
}

function rebuildRecordsEnemyFleet(records, getters) {
  if (!getters) return asArray(records);
  return asArray(records).map((record) => rebuildRecordEnemyFleet(record, getters));
}

module.exports = {
  BattleDetailBuilder,
  buildEnemyFleetFromPacket,
  computeEnemyFinalParam,
  computeFriendlyParams,
  createMasterGetters,
  createMasterGettersFromEnemyStatsById,
  createMasterGettersFromPoiState,
  enrichEnemyFleetForDisplay,
  enrichEnemyShipForDisplay,
  findEnemyFleetPacket,
  hasEnemyFleetPayload,
  readBattleStartEnemyHp,
  readCurrentEnemyHp,
  readCurrentFriendlyHp,
  readEnemyHpFromPacketData,
  readFriendlyHpFromPacketData,
  normalizeApiPath,
  paramsToStats,
  rebuildRecordEnemyFleet,
  rebuildRecordsEnemyFleet,
  resolveMasterGetters,
  syncBattleDetailEntryHp,
};
