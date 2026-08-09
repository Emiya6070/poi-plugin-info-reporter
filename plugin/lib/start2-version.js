'use strict';

const { createHash } = require('crypto');

const START2_PATH = '/kcsapi/api_start2/getData';
const START2_VERSION_PATTERN = /^[a-f0-9]{64}$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function unwrapStart2Data(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.api_data || payload.data || payload;
}

function computeStart2Version(payload) {
  return createHash('sha256')
    .update(canonicalStringify(unwrapStart2Data(payload)))
    .digest('hex');
}

function normalizeStart2Version(value) {
  const version = String(value || '').trim().toLowerCase();
  return START2_VERSION_PATTERN.test(version) ? version : null;
}

function indexByApiId(items) {
  if (!Array.isArray(items)) return {};
  return items.reduce((result, item) => {
    if (item && item.api_id !== undefined && item.api_id !== null) {
      result[String(item.api_id)] = item;
    }
    return result;
  }, {});
}

function extractStart2Master(payload) {
  const data = unwrapStart2Data(payload);
  return {
    masterShips: indexByApiId(data.api_mst_ship),
    masterEquips: indexByApiId(data.api_mst_slotitem),
  };
}

module.exports = {
  START2_PATH,
  canonicalStringify,
  computeStart2Version,
  extractStart2Master,
  normalizeStart2Version,
  unwrapStart2Data,
};
