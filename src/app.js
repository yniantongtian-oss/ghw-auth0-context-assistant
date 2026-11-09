const path = require('path');
const express = require('express');
const { createCheckJwt } = require('./middleware/check-jwt');
const { SettingsStore } = require('./store/settings-store');
const { validateSettingsPatch } = require('./settings/validate');
const { getWeather: fetchWeather } = require('./services/weather');
const { loadCalendar } = require('./services/token-vault');
const { handleMessage } = require('./agent/router');
const { completeWithLlm } = require('./llm');

function createApp({ config, store, getWeather, fetchImpl = globalThis.fetch } = {}) {
  if (!config || !config.jwt || !config.jwt.audience) {
    throw new Error('config.jwt.audience is required');
  }

  const settingsStore = store || new SettingsStore(config.settingsFile);
  const weatherFn = getWeather || ((args) => fetchWeather(args, { fetchImpl }));
  const checkJwt = createCheckJwt(config.jwt);
  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  mountAuth(app, config);

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      auth0: Boolean(config.auth0 && config.auth0.enabled),
      tokenVault: Boolean(config.tokenVault && config.tokenVault.enabled),
      llm: Boolean(config.llm && config.llm.apiKey),
    });
  });

  app.get('/api/session', (req, res) => {
    const authenticated = isAuthenticated(req);
    res.json({
      authenticated,
      auth0Configured: Boolean(config.auth0 && config.auth0.enabled),
      domain: config.auth0 && config.auth0.domain,
      audience: config.auth0 && config.auth0.audience,
      tokenVault: Boolean(config.tokenVault && config.tokenVault.enabled),
      llm: Boolean(config.llm && config.llm.apiKey),
      user: authenticated ? publicUser(req.oidc.user) : null,
    });
  });

  app.get('/api/settings', checkJwt, (req, res, next) => {
    try {
      res.json(settingsStore.get(subject(req)));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/settings', checkJwt, asyncRoute(async (req, res) => {
    const parsed = validateSettingsPatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid_settings', error_description: parsed.error });
      return;
    }
    res.json(await settingsStore.update(subject(req), parsed.value));
  }));

  app.get('/api/me/settings', requireSession, asyncRoute(async (req, res) => {
    const token = await sessionAccessToken(req);
    res.json(await callSettings(config, fetchImpl, 'GET', token));
  }));

  app.put('/api/me/settings', requireSession, asyncRoute(async (req, res) => {
    const token = await sessionAccessToken(req);
    res.json(await callSettings(config, fetchImpl, 'PUT', token, req.body));
  }));

  app.post('/api/chat', asyncRoute(async (req, res) => {
    const message = req.body && req.body.message;
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'bad_request', error_description: 'message is required.' });
      return;
    }
    if (message.length > 500) {
      res.status(400).json({ error: 'bad_request', error_description: 'message must be 500 characters or fewer.' });
      return;
    }

    const accessToken = await resolveAccessToken(req);
    const result = await handleMessage(message, {
      getSettings: () => callSettings(config, fetchImpl, 'GET', accessToken),
      updateSettings: (patch) => callSettings(config, fetchImpl, 'PUT', accessToken, patch),
      getWeather: (args) => weatherFn(args),
      tokenVaultEnabled: Boolean(config.tokenVault && config.tokenVault.enabled),
      getCalendar: config.tokenVault && config.tokenVault.enabled
        ? () => loadCalendar({ req, accessToken, config, fetchImpl })
        : undefined,
      complete: config.llm && config.llm.apiKey
        ? (input) => completeWithLlm({
          apiKey: config.llm.apiKey,
          baseURL: config.llm.baseURL,
          model: config.llm.model,
          fetchImpl,
          ...input,
        })
        : undefined,
    });
    res.json(result);
  }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found', error_description: 'No such API route.' });
  });

  const publicDir = config.publicDir || path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, { index: 'index.html' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(publicDir, 'index.html'), (error) => {
      if (error) next(error);
    });
  });

  app.use(errorHandler);
  return app;
}

function mountAuth(app, config) {
  if (!config.auth0 || !config.auth0.enabled) {
    app.use((req, res, next) => {
      req.oidc = { isAuthenticated: () => false };
      next();
    });
    return;
  }

  const { auth } = require('express-openid-connect');
  app.use(auth({
    authRequired: false,
    auth0Logout: true,
    baseURL: config.auth0.baseURL,
    clientID: config.auth0.clientID,
    clientSecret: config.auth0.clientSecret,
    secret: config.auth0.secret,
    issuerBaseURL: config.auth0.issuerBaseURL,
    authorizationParams: {
      response_type: 'code',
      audience: config.auth0.audience,
      scope: config.auth0.scope,
    },
    routes: {
      login: '/login',
      logout: '/logout',
      callback: '/callback',
      postLogoutRedirect: '/',
    },
    session: {
      name: 'context_assistant',
      rolling: true,
      rollingDuration: 8 * 60 * 60,
      absoluteDuration: 24 * 60 * 60,
      cookie: {
        httpOnly: true,
        sameSite: 'Lax',
      },
    },
  }));
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isAuthenticated(req) {
  return Boolean(req.oidc && typeof req.oidc.isAuthenticated === 'function' && req.oidc.isAuthenticated());
}

function requireSession(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({
    error: 'login_required',
    error_description: 'Log in to continue.',
  });
}

function publicUser(user = {}) {
  return {
    sub: user.sub || null,
    name: user.name || user.nickname || user.email || user.sub || 'Signed in',
    email: user.email || null,
    picture: user.picture || null,
  };
}

function subject(req) {
  const sub = req.auth && req.auth.payload && req.auth.payload.sub;
  if (typeof sub !== 'string' || !sub) {
    const error = new Error('Access token is missing a subject.');
    error.status = 401;
    error.code = 'invalid_token';
    throw error;
  }
  return sub;
}

async function sessionAccessToken(req) {
  const current = req.oidc && req.oidc.accessToken;
  if (!current || !current.access_token) {
    const error = new Error('Login did not include an API access token. Authorize this application for the API and request its audience.');
    error.status = 401;
    error.code = 'missing_access_token';
    throw error;
  }
  if (typeof current.isExpired === 'function' && current.isExpired()) {
    try {
      const refreshed = await current.refresh();
      return refreshed.access_token;
    } catch {
      const error = new Error('Access token expired. Log in again. Enable Allow Offline Access if you want silent refresh.');
      error.status = 401;
      error.code = 'expired_access_token';
      throw error;
    }
  }
  return current.access_token;
}

async function resolveAccessToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)/i);
  if (match) return match[1];
  if (isAuthenticated(req)) return sessionAccessToken(req);
  const error = new Error('Log in, or send an Authorization: Bearer access token.');
  error.status = 401;
  error.code = 'unauthorized';
  throw error;
}

function apiBase(config) {
  if (typeof config.resolveInternalBaseUrl === 'function') {
    return config.resolveInternalBaseUrl();
  }
  return config.internalBaseUrl;
}

async function callSettings(config, fetchImpl, method, accessToken, body) {
  const response = await fetchImpl(`${apiBase(config)}/api/settings`, {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || `Settings API failed (${response.status}).`);
    error.status = response.status;
    error.code = payload.error || 'settings_api_error';
    throw error;
  }
  return payload;
}

function safeMessage(error) {
  const message = error && error.message ? String(error.message) : 'Something went wrong.';
  if (message.length > 400 || /eyJ[a-zA-Z0-9_-]{10,}/.test(message)) {
    return 'Something went wrong.';
  }
  return message;
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error && error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_request', error_description: 'Invalid JSON body.' });
    return;
  }
  const status = Number(error.status || error.statusCode || 500);
  if (error && error.headers) {
    for (const [key, value] of Object.entries(error.headers)) {
      res.set(key, value);
    }
  }
  if (status >= 400 && status < 500) {
    res.status(status).json({
      error: error.code || (status === 401 ? 'unauthorized' : 'bad_request'),
      error_description: safeMessage(error),
    });
    return;
  }
  console.error(safeMessage(error));
  res.status(500).json({ error: 'server_error', error_description: 'Something went wrong.' });
}

module.exports = { createApp };
