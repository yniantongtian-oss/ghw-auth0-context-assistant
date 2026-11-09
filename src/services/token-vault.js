// Auth0 Token Vault exchange. Docs:
// https://auth0.com/docs/secure/call-apis-on-users-behalf/token-vault/access-token-exchange-with-token-vault
// https://auth0.com/docs/secure/call-apis-on-users-behalf/token-vault/refresh-token-exchange-with-token-vault

const GRANT_TYPE = 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const REFRESH_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:refresh_token';
const REQUESTED_TOKEN_TYPE = 'http://auth0.com/oauth/token-type/federated-connection-access-token';

function buildTokenExchangeBody({ clientId, clientSecret, subjectToken, subjectTokenType, connection }) {
  return {
    client_id: clientId,
    client_secret: clientSecret,
    subject_token: subjectToken,
    grant_type: GRANT_TYPE,
    subject_token_type: subjectTokenType || ACCESS_TOKEN_TYPE,
    requested_token_type: REQUESTED_TOKEN_TYPE,
    connection: connection || 'google-oauth2',
  };
}

function selectSubjectToken({ exchange = 'auto', refreshToken, accessToken }) {
  const useRefresh = exchange === 'refresh_token' || (exchange === 'auto' && refreshToken);
  if (useRefresh) {
    if (!refreshToken) {
      const error = new Error('No Auth0 refresh token is in the session. Add offline_access and enable Allow Offline Access on the API, or set TOKEN_VAULT_EXCHANGE=access_token.');
      error.code = 'missing_refresh_token';
      throw error;
    }
    return { token: refreshToken, type: REFRESH_TOKEN_TYPE };
  }
  if (!accessToken) {
    const error = new Error('No Auth0 access token is available for the Token Vault exchange.');
    error.code = 'missing_access_token';
    throw error;
  }
  return { token: accessToken, type: ACCESS_TOKEN_TYPE };
}

async function exchangeFederatedToken({
  domain,
  clientId,
  clientSecret,
  subjectToken,
  subjectTokenType,
  connection,
  fetchImpl = globalThis.fetch,
}) {
  const body = buildTokenExchangeBody({
    clientId,
    clientSecret,
    subjectToken,
    subjectTokenType,
    connection,
  });
  const response = await fetchImpl(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || `Token Vault exchange failed (${response.status}).`);
    error.status = response.status;
    error.code = 'token_vault_exchange_failed';
    throw error;
  }
  return {
    access_token: payload.access_token,
    expires_in: payload.expires_in,
    scope: payload.scope,
    token_type: payload.token_type,
  };
}

async function listUpcomingEvents(accessToken, { fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', now.toISOString());

  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error && payload.error.message
      ? payload.error.message
      : `Google Calendar request failed (${response.status}).`;
    const error = new Error(message);
    error.code = 'calendar_failed';
    error.status = response.status;
    throw error;
  }

  return (payload.items || []).slice(0, 5).map((item) => ({
    title: item.summary || '(untitled)',
    start: (item.start && (item.start.dateTime || item.start.date)) || '',
    location: item.location || '',
  }));
}

async function loadCalendar({ req, accessToken, config, fetchImpl }) {
  const vault = config.tokenVault;
  if (!vault.clientId || !vault.clientSecret) {
    throw new Error('Token Vault client id and secret are missing.');
  }
  const subject = selectSubjectToken({
    exchange: vault.exchange,
    refreshToken: req.oidc && req.oidc.refreshToken,
    accessToken,
  });
  const exchanged = await exchangeFederatedToken({
    domain: vault.domain,
    clientId: vault.clientId,
    clientSecret: vault.clientSecret,
    subjectToken: subject.token,
    subjectTokenType: subject.type,
    connection: vault.connection,
    fetchImpl,
  });
  if (!exchanged.access_token) {
    throw new Error('Token Vault did not return a provider access token.');
  }
  return listUpcomingEvents(exchanged.access_token, { fetchImpl });
}

module.exports = {
  GRANT_TYPE,
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
  REQUESTED_TOKEN_TYPE,
  buildTokenExchangeBody,
  selectSubjectToken,
  exchangeFederatedToken,
  listUpcomingEvents,
  loadCalendar,
};
