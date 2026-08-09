'use strict';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readPath(source, path) {
  return path.reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, source);
}

function firstDefined() {
  for (let index = 0; index < arguments.length; index += 1) {
    if (arguments[index] !== undefined && arguments[index] !== null) return arguments[index];
  }
  return undefined;
}

function unwrapApiData(value) {
  if (!value || typeof value !== 'object') return {};
  return value.api_data || value.data || value;
}

function extractMasterShips(source) {
  const data = unwrapApiData(source);
  return firstDefined(
    readPath(data, ['const', '$ships']),
    readPath(data, ['$ships']),
    readPath(data, ['info', 'mst_ships']),
    readPath(data, ['info', 'mstShips']),
    readPath(data, ['info', 'master', 'ships']),
    data.api_mst_ship,
    readPath(data, ['api_start2', 'api_data', 'api_mst_ship']),
    readPath(data, ['api_start2', 'api_mst_ship']),
    readPath(data, ['mst', 'ships']),
    readPath(data, ['master', 'ships']),
    data.mst_ship,
    data.ships
  );
}

function extractMasterEquipment(source) {
  const data = unwrapApiData(source);
  return firstDefined(
    readPath(data, ['const', '$equips']),
    readPath(data, ['$equips']),
    readPath(data, ['info', 'mst_slotitems']),
    readPath(data, ['info', 'mstSlotitems']),
    readPath(data, ['info', 'mstSlotItems']),
    readPath(data, ['info', 'master', 'slotitems']),
    readPath(data, ['info', 'master', 'items']),
    readPath(data, ['master', 'slotitems']),
    readPath(data, ['master', 'items']),
    readPath(data, ['mst', 'slotitems']),
    readPath(data, ['mst', 'items']),
    readPath(data, ['api_start2', 'api_data', 'api_mst_slotitem']),
    readPath(data, ['api_start2', 'api_mst_slotitem']),
    data.api_mst_slotitem,
    data.mst_slotitem,
    data.masterSlotitems,
    data.masterItems
  );
}

function normalizeRangeStat(value) {
  if (Array.isArray(value)) return toNumber(value[0], null);
  return toNumber(value, null);
}

function detectEnemyType(raw, stype, name) {
  const normalizedName = String(name || '').toLowerCase();
  const sortNo = toNumber(raw && raw.api_sortno, null);

  if (
    stype === 13
    || stype === 14
    || normalizedName.indexOf('submarine') !== -1
    || normalizedName.indexOf('sub') !== -1
    || normalizedName.indexOf('潜水') !== -1
  ) {
    return 'SS';
  }

  if (
    stype === 15
    || stype === 16
    || (sortNo !== null && sortNo >= 1500)
    || normalizedName.indexOf('installation') !== -1
    || normalizedName.indexOf('harbor') !== -1
    || normalizedName.indexOf('anchorage') !== -1
    || normalizedName.indexOf('airfield') !== -1
    || normalizedName.indexOf('fortress') !== -1
    || normalizedName.indexOf('battery') !== -1
    || normalizedName.indexOf('supply depot') !== -1
  ) {
    return 'LAND';
  }

  return stype;
}

function normalizeEnemyMasterShip(ship) {
  const raw = ship || {};
  const id = toNumber(firstDefined(raw.id, raw.api_id, raw.masterId, raw.api_ship_id), null);
  if (id === null || id <= 0) return null;

  const stype = toNumber(firstDefined(raw.type, raw.stype, raw.api_stype), null);
  const name = firstDefined(raw.name, raw.api_name, raw.yomi, raw.api_yomi, null);
  const hp = normalizeRangeStat(firstDefined(raw.hp, raw.taik, raw.api_taik));

  return {
    id,
    masterId: id,
    name,
    type: detectEnemyType(raw, stype, name),
    stype,
    hp,
    maxHp: hp,
    armor: normalizeRangeStat(firstDefined(raw.armor, raw.souk, raw.api_souk)),
    fire: normalizeRangeStat(firstDefined(raw.fire, raw.firepower, raw.houg, raw.api_houg)),
    torpedo: normalizeRangeStat(firstDefined(raw.torpedo, raw.raig, raw.api_raig)),
    aa: normalizeRangeStat(firstDefined(raw.aa, raw.antiAir, raw.tyku, raw.api_tyku)),
    asw: normalizeRangeStat(firstDefined(raw.asw, raw.tais, raw.api_tais)),
    speed: toNumber(firstDefined(raw.speed, raw.soku, raw.api_soku), null),
    slotCount: toNumber(firstDefined(raw.slotCount, raw.slot_num, raw.api_slot_num), null),
    // Keep this module free of noro6/static air tables so the POI plugin pack
    // only ships snapshot helpers. Analysis fills missing slots via noro6-enemy-air.
    slots: asArray(firstDefined(raw.slots, raw.maxeq, raw.api_maxeq))
      .map((slot) => toNumber(slot, 0))
      .map((slot) => (slot > 0 ? slot : 0)),
    equipmentMasterIds: asArray(firstDefined(raw.equipmentMasterIds, raw.slotitem_id, raw.api_slotitem_id))
      .filter((itemId) => itemId !== -1 && itemId !== null)
      .map((itemId) => toNumber(itemId, null))
      .filter((itemId) => itemId !== null),
  };
}

function normalizeEnemyMasterEquipment(item) {
  const raw = item || {};
  const id = toNumber(firstDefined(raw.id, raw.api_id, raw.masterId, raw.api_slotitem_id), null);
  if (id === null || id <= 0) return null;
  return {
    id,
    masterId: id,
    name: firstDefined(raw.name, raw.api_name, null),
    aa: normalizeRangeStat(firstDefined(raw.aa, raw.antiAir, raw.tyku, raw.api_tyku)),
    type: firstDefined(raw.type, raw.api_type, null),
  };
}

function createEnemyStatsById(source) {
  return asArray(extractMasterShips(source)).reduce((result, ship) => {
    const normalized = normalizeEnemyMasterShip(ship);
    if (normalized) result[normalized.id] = normalized;
    return result;
  }, {});
}

function createEnemyEquipmentById(source) {
  return asArray(extractMasterEquipment(source)).reduce((result, item) => {
    const normalized = normalizeEnemyMasterEquipment(item);
    if (normalized) result[normalized.id] = normalized;
    return result;
  }, {});
}

module.exports = {
  createEnemyEquipmentById,
  createEnemyStatsById,
  detectEnemyType,
  extractMasterEquipment,
  extractMasterShips,
  normalizeEnemyMasterEquipment,
  normalizeEnemyMasterShip,
};
