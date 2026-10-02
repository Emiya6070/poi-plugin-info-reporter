'use strict';

function experienceValue(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function battleResultExperience(response) {
  if (!response || (response.api_result != null && Number(response.api_result) !== 1)) return null;
  const body = response.api_data || response;
  return {
    total: experienceValue(body.api_member_exp),
    gained: experienceValue(body.api_get_exp),
  };
}

module.exports = { battleResultExperience, experienceValue };
