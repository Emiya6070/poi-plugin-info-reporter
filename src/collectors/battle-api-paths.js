'use strict';

/**
 * Battle API path tables shared by capture/snapshot builders and the recorder.
 * Kept free of calculator / KC3 dependencies so the POI plugin pack stays lean.
 */

const BATTLE_API_PATHS = Object.freeze({
  '/kcsapi/api_req_sortie/battle': true,
  '/kcsapi/api_req_battle/battle': true,
  '/kcsapi/api_req_sortie/airbattle': true,
  '/kcsapi/api_req_sortie/ld_airbattle': true,
  '/kcsapi/api_req_battle_midnight/battle': true,
  '/kcsapi/api_req_battle_midnight/sp_midnight': true,
  '/kcsapi/api_req_combined_battle/battle': true,
  '/kcsapi/api_req_combined_battle/battle_water': true,
  '/kcsapi/api_req_combined_battle/airbattle': true,
  '/kcsapi/api_req_combined_battle/ld_airbattle': true,
  '/kcsapi/api_req_combined_battle/ec_battle': true,
  '/kcsapi/api_req_combined_battle/each_battle': true,
  '/kcsapi/api_req_combined_battle/each_battle_water': true,
  '/kcsapi/api_req_combined_battle/midnight_battle': true,
  '/kcsapi/api_req_combined_battle/sp_midnight': true,
  '/kcsapi/api_req_combined_battle/ec_midnight_battle': true,
  '/kcsapi/api_req_combined_battle/ld_shooting': true,
  '/kcsapi/api_req_combined_battle/night_to_day': true,
  '/kcsapi/api_req_practice/battle': true,
  '/kcsapi/api_req_practice/midnight_battle': true,
});

const BATTLE_RESULT_API_PATHS = Object.freeze({
  '/kcsapi/api_req_sortie/battleresult': true,
  '/kcsapi/api_req_combined_battle/battleresult': true,
});

function normalizeApiPath(path) {
  if (!path) return '';
  const text = String(path);
  const queryIndex = text.indexOf('?');
  return queryIndex === -1 ? text : text.slice(0, queryIndex);
}

function isBattleApiPath(path) {
  return Boolean(BATTLE_API_PATHS[normalizeApiPath(path)]);
}

function isBattleResultApiPath(path) {
  return Boolean(BATTLE_RESULT_API_PATHS[normalizeApiPath(path)]);
}

module.exports = {
  BATTLE_API_PATHS,
  BATTLE_RESULT_API_PATHS,
  isBattleApiPath,
  isBattleResultApiPath,
  normalizeApiPath,
};
