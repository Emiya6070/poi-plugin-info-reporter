'use strict';

const { PLUGIN_VERSION } = require('./version');

function normalizeHttpBase(url) {
  const value = String(url || 'http://127.0.0.1:3721').trim();
  return value
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/$/, '');
}

function normalizeProxyUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value
    .replace(/^socks5h:\/\//i, 'socks5://')
    .replace(/\/$/, '');
}

function loadNodeHttp() {
  try {
    return {
      http: require('http'),
      https: require('https'),
      URL: require('url').URL,
    };
  } catch (error) {
    return null;
  }
}

function requestOnce(transport, options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(Buffer.concat(chunks).toString('utf8')),
          json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request_timeout')));
    if (body) req.write(body);
    req.end();
  });
}

function postThroughHttpProxy(targetUrl, proxyUrl, body, headers, node, timeoutMs) {
  const target = new node.URL(targetUrl);
  const proxy = new node.URL(proxyUrl);
  const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
  const transport = proxy.protocol === 'https:' ? node.https : node.http;

  if (target.protocol === 'http:') {
    return requestOnce(transport, {
      protocol: proxy.protocol,
      hostname: proxy.hostname,
      port: proxyPort,
      method: 'POST',
      path: target.href,
      headers: Object.assign({}, headers, {
        Host: target.host,
      }),
    }, body, timeoutMs);
  }

  // HTTPS target: CONNECT then TLS POST
  return new Promise((resolve, reject) => {
    const connectReq = transport.request({
      protocol: proxy.protocol,
      hostname: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      headers: {
        Host: `${target.hostname}:${target.port || 443}`,
      },
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`proxy CONNECT failed: ${res.statusCode}`));
        return;
      }
      const tlsReq = node.https.request({
        protocol: 'https:',
        hostname: target.hostname,
        port: target.port || 443,
        method: 'POST',
        path: `${target.pathname}${target.search}`,
        headers,
        socket,
        servername: target.hostname,
      }, (tlsRes) => {
        const chunks = [];
        tlsRes.on('data', (chunk) => chunks.push(chunk));
        tlsRes.on('end', () => {
          resolve({
            ok: tlsRes.statusCode >= 200 && tlsRes.statusCode < 300,
            status: tlsRes.statusCode,
            text: () => Promise.resolve(Buffer.concat(chunks).toString('utf8')),
            json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')),
          });
        });
      });
      tlsReq.on('error', reject);
      tlsReq.setTimeout(timeoutMs, () => tlsReq.destroy(new Error('request_timeout')));
      tlsReq.write(body);
      tlsReq.end();
    });
    connectReq.on('error', reject);
    connectReq.setTimeout(timeoutMs, () => connectReq.destroy(new Error('request_timeout')));
    connectReq.end();
  });
}

function postDirect(targetUrl, body, headers, node, timeoutMs) {
  const target = new node.URL(targetUrl);
  const transport = target.protocol === 'https:' ? node.https : node.http;
  return requestOnce(transport, {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: 'POST',
    path: `${target.pathname}${target.search}`,
    headers,
  }, body, timeoutMs);
}

function createHttpClient(options) {
  let baseUrl = normalizeHttpBase(options && options.url);
  let proxyUrl = normalizeProxyUrl(options && options.proxyUrl);
  let ingestToken = String((options && options.token) || '').trim();
  const fetchImpl = options && options.fetch
    ? options.fetch
    : (typeof fetch !== 'undefined' ? fetch : null);
  const node = options && options.node === false ? null : loadNodeHttp();
  const timeoutMs = Math.max(1000, Number(options && options.timeoutMs) || 15000);
  const retryCount = options && Object.prototype.hasOwnProperty.call(options, 'retryCount')
    ? Math.max(0, Math.min(5, Number(options.retryCount) || 0))
    : 1;
  const maxQueueSize = Math.max(10, Number(options && options.maxQueueSize) || 200);
  let queuedCount = 0;
  let queue = Promise.resolve();

  function setUrl(url) {
    baseUrl = normalizeHttpBase(url);
  }

  function setProxyUrl(url) {
    proxyUrl = normalizeProxyUrl(url);
  }

  function setToken(token) {
    ingestToken = String(token || '').trim();
  }

  function buildHeaders(body, token) {
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-Plugin-Version': PLUGIN_VERSION,
    };
    if (token) {
      headers['X-Forwarder-Token'] = token;
    }
    return headers;
  }

  function fetchWithTimeout(endpoint, fetchOptions) {
    if (typeof AbortController === 'undefined') return fetchImpl(endpoint, fetchOptions);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetchImpl(endpoint, Object.assign({}, fetchOptions, { signal: controller.signal }))
      .finally(() => clearTimeout(timer));
  }

  function sendOnce(payload, config) {
    const endpoint = `${config.baseUrl}/ingest`;
    const body = JSON.stringify(payload);
    const headers = buildHeaders(body, config.ingestToken);

    if (config.proxyUrl) {
      if (!node) {
        return Promise.reject(new Error('HTTP proxy requires Node http/https in this environment'));
      }
      if (!/^https?:\/\//i.test(config.proxyUrl)) {
        return Promise.reject(new Error('proxy must be an http(s) URL, e.g. http://127.0.0.1:7890'));
      }
      return postThroughHttpProxy(endpoint, config.proxyUrl, body, headers, node, timeoutMs);
    }

    if (fetchImpl && !(options && options.preferNode)) {
      const fetchHeaders = {
        'Content-Type': 'application/json',
        'X-Plugin-Version': PLUGIN_VERSION,
      };
      if (config.ingestToken) fetchHeaders['X-Forwarder-Token'] = config.ingestToken;
      return fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body,
      });
    }

    if (node) {
      return postDirect(endpoint, body, headers, node, timeoutMs);
    }

    if (fetchImpl) {
      const fetchHeaders = { 'Content-Type': 'application/json' };
      if (config.ingestToken) fetchHeaders['X-Forwarder-Token'] = config.ingestToken;
      return fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body,
      });
    }

    return Promise.reject(new Error('fetch is not available in this environment'));
  }

  async function sendWithRetry(payload, config) {
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const response = await sendOnce(payload, config);
        if (response.ok || (response.status !== 429 && response.status < 500)) return response;
        lastError = new Error(`http_${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < retryCount) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError || new Error('request_failed');
  }

  function enqueue(work) {
    if (queuedCount >= maxQueueSize) {
      return Promise.reject(new Error('send_queue_full'));
    }
    queuedCount += 1;
    const config = { baseUrl, proxyUrl, ingestToken };
    const pending = queue.then(
      () => work(config),
      () => work(config),
    );
    queue = pending.catch(() => {});
    return pending.finally(() => {
      queuedCount = Math.max(0, queuedCount - 1);
    });
  }

  function withPluginVersion(payload) {
    return Object.assign({}, payload || {}, {
      pluginVersion: (payload && payload.pluginVersion) || PLUGIN_VERSION,
    });
  }

  function send(payload) {
    const nextPayload = Object.assign({}, payload || {}, {
      pluginVersion: (payload && payload.pluginVersion) || PLUGIN_VERSION,
    });
    return enqueue((config) => sendWithRetry(nextPayload, config));
  }

  function syncStart2(probePayload, dataPayload) {
    return enqueue(async (config) => {
      const probeResponse = await sendWithRetry(withPluginVersion(probePayload), config);
      let status = null;
      try {
        status = await probeResponse.json();
      } catch (error) {
        status = null;
      }
      if (!probeResponse.ok || !status || !status.ok) {
        const reason = status && status.reason ? status.reason : `http_${probeResponse.status}`;
        throw new Error(reason);
      }
      if (!status.uploadRequired) {
        return { ok: true, uploaded: false, status };
      }
      const uploadResponse = await sendWithRetry(withPluginVersion(dataPayload), config);
      let uploadStatus = null;
      try {
        uploadStatus = await uploadResponse.json();
      } catch (error) {
        uploadStatus = null;
      }
      if (!uploadResponse.ok || !uploadStatus || !uploadStatus.ok) {
        const reason = uploadStatus && uploadStatus.reason
          ? uploadStatus.reason
          : `http_${uploadResponse.status}`;
        throw new Error(reason);
      }
      return { ok: true, uploaded: true, status: uploadStatus };
    });
  }

  return {
    send,
    syncStart2,
    setUrl,
    setProxyUrl,
    setToken,
    getUrl: () => baseUrl,
    getProxyUrl: () => proxyUrl,
    getToken: () => ingestToken,
    getQueueSize: () => queuedCount,
    getPluginVersion: () => PLUGIN_VERSION,
  };
}

module.exports = {
  createHttpClient,
  normalizeHttpBase,
  normalizeProxyUrl,
  PLUGIN_VERSION,
};
