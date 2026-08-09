'use strict';

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

function readStorePath(getStore, path) {
  if (!getStore) return undefined;
  const segments = Array.isArray(path) ? path : String(path).split('.');
  const fullPath = segments.join('.');
  try {
    const direct = toPlain(getStore(fullPath));
    if (direct !== undefined && direct !== null) return direct;
  } catch (error) {
    // fall through
  }
  try {
    let current = getStore(segments[0]);
    for (let index = 1; index < segments.length; index += 1) {
      if (current === undefined || current === null) return undefined;
      if (current && typeof current.get === 'function') {
        current = current.get(segments[index]);
      } else {
        current = current[segments[index]];
      }
    }
    return toPlain(current);
  } catch (error) {
    return undefined;
  }
}

module.exports = {
  readStorePath,
  toPlain,
};
