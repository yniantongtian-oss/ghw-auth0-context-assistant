const path = require('path');

const PLACEHOLDER = /^(your_|replace_with|changeme|todo)/i;

function present(value) {
  if (value == null) return false;
  const trimmed = String(value).trim();
  return Boolean(trimmed) && !PLACEHOLDER.test(trimmed);
}

function loadConfig(env = process.env) {
  const domain = String(env.AUTH0_DOMAIN || 'dev-wvxvhbnjrgvgn26x.us.auth0.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const audience = env.AUTH0_AUDIENCE || 'https://context-assistant.api';
  const port = Number(env.PORT || 3000);
  const baseURL = env.APP_BASE_URL || `http://localhost:${port}`;
  const clientID = env.AUTH0_CLIENT_ID || '';
  const clientSecret = env.AUTH0_CLIENT_SECRET || '';
  const secret = env.AUTH0_SECRET || '';
  const authEnabled = present(clientID) && present(clientSecret) && present(secret) && secret.trim().length >= 32;
  const vaultClientId = present(env.TOKEN_VAULT_CLIENT_ID) ? env.TOKEN_VAULT_CLIENT_ID.trim() : clientID.trim();
  const vaultClientSecret = present(env.TOKEN_VAULT_CLIENT_SECRET)
    ? env.TOKEN_VAULT_CLIENT_SECRET.trim()
    : clientSecret.trim();

  return {
    port,
    publicDir: path.join(__dirname, '..', 'public'),
    settingsFile: env.SETTINGS_FILE
      ? path.resolve(env.SETTINGS_FILE)
      : path.join(process.cwd(), 'data', 'settings.json'),
    internalBaseUrl: env.INTERNAL_BASE_URL || `http://127.0.0.1:${port}`,
    auth0: {
      enabled: authEnabled,
      domain,
      issuerBaseURL: `https://${domain}`,
      clientID: clientID.trim(),
      clientSecret: clientSecret.trim(),
      secret: secret.trim(),
      audience,
      baseURL,
      scope: env.AUTH0_SCOPE || 'openid profile email',
    },
    jwt: {
      issuerBaseURL: `https://${domain}`,
      audience,
      clockTolerance: 5,
    },
    llm: {
      apiKey: present(env.OPENAI_API_KEY) ? env.OPENAI_API_KEY.trim() : '',
      baseURL: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    tokenVault: {
      enabled: String(env.ENABLE_TOKEN_VAULT || 'false').toLowerCase() === 'true',
      connection: env.AUTH0_TOKEN_VAULT_CONNECTION || 'google-oauth2',
      exchange: env.TOKEN_VAULT_EXCHANGE || 'auto',
      clientId: vaultClientId,
      clientSecret: vaultClientSecret,
      domain,
    },
  };
}

module.exports = { loadConfig, present };
