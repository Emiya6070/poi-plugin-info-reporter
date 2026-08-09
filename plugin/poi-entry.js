'use strict';

const React = require('react');
const { createForwarder, createHttpClient } = require('./index');
const { PLUGIN_VERSION } = require('./version');

const TARGET_URL_KEY = 'plugin.KanColleForwarder.targetUrl';
const PROXY_URL_KEY = 'plugin.KanColleForwarder.proxyUrl';
const TOKEN_KEY = 'plugin.KanColleForwarder.ingestToken';
const DEFAULT_TARGET_URL = 'http://127.0.0.1:3721';

function getPoiStore(path) {
  const root = typeof window !== 'undefined' ? window : global;
  return root && typeof root.getStore === 'function' ? root.getStore(path) : undefined;
}

function getConfig() {
  const root = typeof window !== 'undefined' ? window : global;
  return root && root.config;
}

function getTargetUrl() {
  const config = getConfig();
  return config && typeof config.get === 'function'
    ? config.get(TARGET_URL_KEY, DEFAULT_TARGET_URL)
    : DEFAULT_TARGET_URL;
}

function getProxyUrl() {
  const config = getConfig();
  return config && typeof config.get === 'function'
    ? config.get(PROXY_URL_KEY, '')
    : '';
}

function getIngestToken() {
  const config = getConfig();
  return config && typeof config.get === 'function'
    ? String(config.get(TOKEN_KEY, '') || '')
    : '';
}

const client = createHttpClient({
  url: getTargetUrl(),
  proxyUrl: getProxyUrl(),
  token: getIngestToken(),
});

const capture = createForwarder({
  client,
  getTargetUrl,
  getProxyUrl,
  getToken: getIngestToken,
  getStore: getPoiStore,
});

class ForwarderSettings extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      targetUrl: getTargetUrl(),
      proxyUrl: getProxyUrl(),
      ingestToken: getIngestToken(),
    };
    this.handleTargetChange = this.handleTargetChange.bind(this);
    this.handleProxyChange = this.handleProxyChange.bind(this);
    this.handleTokenChange = this.handleTokenChange.bind(this);
  }

  handleTargetChange(event) {
    const targetUrl = event.target.value;
    this.setState({ targetUrl });
    const config = getConfig();
    if (config && typeof config.set === 'function') {
      config.set(TARGET_URL_KEY, targetUrl);
    }
    if (typeof client.setUrl === 'function') {
      client.setUrl(targetUrl);
    }
  }

  handleProxyChange(event) {
    const proxyUrl = event.target.value;
    this.setState({ proxyUrl });
    const config = getConfig();
    if (config && typeof config.set === 'function') {
      config.set(PROXY_URL_KEY, proxyUrl);
    }
    if (typeof client.setProxyUrl === 'function') {
      client.setProxyUrl(proxyUrl);
    }
  }

  handleTokenChange(event) {
    const ingestToken = event.target.value;
    this.setState({ ingestToken });
    const config = getConfig();
    if (config && typeof config.set === 'function') {
      config.set(TOKEN_KEY, ingestToken);
    }
    if (typeof client.setToken === 'function') {
      client.setToken(ingestToken);
    }
  }

  render() {
    return React.createElement(
      'div',
      null,
      React.createElement('p', null, `Info Reporter v${PLUGIN_VERSION}`),
      React.createElement('label', null,
        'Target URL',
        React.createElement('input', {
          type: 'url',
          value: this.state.targetUrl,
          placeholder: DEFAULT_TARGET_URL,
          onChange: this.handleTargetChange,
          style: { display: 'block', width: '100%', marginTop: 6, marginBottom: 12 },
        })
      ),
      React.createElement('label', null,
        'Ingest Token',
        React.createElement('input', {
          type: 'password',
          value: this.state.ingestToken,
          placeholder: 'Must match server POI_FORWARDER_INGEST_TOKEN',
          onChange: this.handleTokenChange,
          autoComplete: 'off',
          style: { display: 'block', width: '100%', marginTop: 6, marginBottom: 12 },
        })
      ),
      React.createElement('label', null,
        'Proxy URL (optional)',
        React.createElement('input', {
          type: 'url',
          value: this.state.proxyUrl,
          placeholder: 'http://127.0.0.1:7890',
          onChange: this.handleProxyChange,
          style: { display: 'block', width: '100%', marginTop: 6 },
        })
      )
    );
  }
}

function pluginDidLoad() {
  capture.installGlobalCapture(typeof window !== 'undefined' ? window : undefined);
  Array.prototype.slice.call(arguments).forEach((candidate) => {
    capture.installGlobalCapture(candidate);
  });
}

function pluginWillUnload() {
  capture.uninstallGlobalCapture(typeof window !== 'undefined' ? window : undefined);
}

module.exports = {
  PLUGIN_VERSION,
  createForwarder,
  createHttpClient,
  settingsClass: ForwarderSettings,
  pluginDidLoad,
  pluginWillUnload,
  forwarder: {
    createForwarder,
    createHttpClient,
  },
};
