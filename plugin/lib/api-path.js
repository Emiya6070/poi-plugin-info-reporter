'use strict';

function normalizeApiPath(path) {
  if (!path) return '';
  const text = String(path);
  try {
    const url = new URL(text, 'http://poi.local');
    return url.pathname;
  } catch (error) {
    const queryIndex = text.indexOf('?');
    return queryIndex === -1 ? text : text.slice(0, queryIndex);
  }
}

function isKcsApiPath(path) {
  return normalizeApiPath(path).indexOf('/kcsapi/') !== -1;
}

const POINT_API_PATHS = new Set([
  '/kcsapi/api_req_map/start',
  '/kcsapi/api_req_map/next',
  // 敌方空袭（出击中 map 空袭节点）
  '/kcsapi/api_req_map/air_raid',
]);

// Map-related packets used for interactive map topology / stage discovery.
const MAP_API_PATHS = new Set([
  '/kcsapi/api_req_map/start',
  '/kcsapi/api_req_map/next',
  '/kcsapi/api_req_map/air_raid',
  '/kcsapi/api_req_map/start_air_base',
  '/kcsapi/api_req_map/select_eventmap_rank',
  '/kcsapi/api_get_member/mapinfo',
]);

const BATTLE_API_PATHS = new Set([
  '/kcsapi/api_req_sortie/battle',
  '/kcsapi/api_req_sortie/airbattle',
  '/kcsapi/api_req_sortie/ld_airbattle',
  '/kcsapi/api_req_sortie/night_to_day',
  '/kcsapi/api_req_battle/battle',
  '/kcsapi/api_req_battle_midnight/battle',
  '/kcsapi/api_req_battle_midnight/sp_midnight',
  '/kcsapi/api_req_practice/battle',
  '/kcsapi/api_req_practice/midnight_battle',
  '/kcsapi/api_req_combined_battle/battle',
  '/kcsapi/api_req_combined_battle/battle_water',
  '/kcsapi/api_req_combined_battle/airbattle',
  '/kcsapi/api_req_combined_battle/ld_airbattle',
  '/kcsapi/api_req_combined_battle/ec_battle',
  '/kcsapi/api_req_combined_battle/each_battle',
  '/kcsapi/api_req_combined_battle/each_battle_water',
  '/kcsapi/api_req_combined_battle/midnight_battle',
  '/kcsapi/api_req_combined_battle/sp_midnight',
  '/kcsapi/api_req_combined_battle/ec_midnight_battle',
  '/kcsapi/api_req_combined_battle/ec_night_to_day',
  // Rare special battles kept in sync with the analyzer's battle table
  // (src/collectors/battle-recorder); historically never forwarded.
  '/kcsapi/api_req_combined_battle/night_to_day',
  '/kcsapi/api_req_combined_battle/ld_shooting',
]);

const BATTLE_RESULT_API_PATHS = new Set([
  '/kcsapi/api_req_sortie/battleresult',
  '/kcsapi/api_req_combined_battle/battleresult',
  // Forwarded for raw archiving/export chain grouping; the analysis pipeline
  // (src/collectors/battle-recorder) intentionally ignores practice results.
  '/kcsapi/api_req_practice/battle_result',
]);

function isPointApiPath(path) {
  return POINT_API_PATHS.has(normalizeApiPath(path));
}

function isMapApiPath(path) {
  return MAP_API_PATHS.has(normalizeApiPath(path));
}

function isBattleApiPath(path) {
  return BATTLE_API_PATHS.has(normalizeApiPath(path));
}

function isBattleResultApiPath(path) {
  return BATTLE_RESULT_API_PATHS.has(normalizeApiPath(path));
}

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'object' && !(body instanceof String)) return body;
  const text = String(body);
  if (text.trim().indexOf('{') === 0) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return {};
    }
  }
  return text.split('&').reduce((result, pair) => {
    const separator = pair.indexOf('=');
    if (separator === -1) return result;
    const key = decodeURIComponent(pair.slice(0, separator).replace(/\+/g, ' '));
    const value = decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, ' '));
    result[key] = value;
    return result;
  }, {});
}

function parseResponsePayload(payload) {
  if (typeof payload === 'string' || payload instanceof String) {
    const trimmed = String(payload).trim();
    const jsonText = trimmed.indexOf('svdata=') === 0 ? trimmed.slice(7) : trimmed;
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      return { raw: trimmed };
    }
  }
  return payload;
}

module.exports = {
  isKcsApiPath,
  isBattleApiPath,
  isBattleResultApiPath,
  isMapApiPath,
  isPointApiPath,
  MAP_API_PATHS,
  POINT_API_PATHS,
  BATTLE_API_PATHS,
  BATTLE_RESULT_API_PATHS,
  normalizeApiPath,
  parseRequestBody,
  parseResponsePayload,
};
