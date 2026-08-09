'use strict';

const { createForwarder } = require('./capture');
const { createHttpClient } = require('./http-client');

module.exports = {
  createForwarder,
  createHttpClient,
};
