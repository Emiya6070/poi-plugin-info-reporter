'use strict';

const path = require('path');

function readPluginVersion() {
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    return String((pkg && pkg.version) || '').trim() || '0.0.0';
  } catch (error) {
    return '0.0.0';
  }
}

const PLUGIN_VERSION = readPluginVersion();

module.exports = {
  PLUGIN_VERSION,
};
