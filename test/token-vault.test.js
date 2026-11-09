const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCESS_TOKEN_TYPE,
  GRANT_TYPE,
  REFRESH_TOKEN_TYPE,
  REQUESTED_TOKEN_TYPE,
  buildTokenExchangeBody,
  exchangeFederatedToken,
  listUpcomingEvents,
  selectSubjectToken,
} = require('../src/services/token-vault');

test('the exchange body matches the Auth0 Token Vault grant', () => {
  const body = buildTokenExchangeBody({
    clientId: 'vault-client',
    clientSecret: 'vault-secret',
    subjectToken: 'subject-token',
    subjectTokenType: REFRESH_TOKEN_TYPE,
    connection: 'google-oauth2',
  });
  assert.deepEqual(body, {
    client_id: 'vault-client',
    client_secret: 'vault-secret',
    subject_token: 'subject-token',
    grant_type: GRANT_TYPE,
    subject_token_type: REFRESH_TOKEN_TYPE,
    requested_token_type: REQUESTED_TOKEN_TYPE,
    connection: 'google-oauth2',
  });
  assert.equal(GRANT_TYPE, 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token');
});

test('auto mode prefers the refresh token and can fall back to the access token', () => {
  const refresh = selectSubjectToken({ exchange: 'auto', refreshToken: 'refresh', accessToken: 'access' });
  assert.equal(refresh.type, REFRESH_TOKEN_TYPE);
  assert.equal(refresh.token, 'refresh');

  const access = selectSubjectToken({ exchange: 'auto', accessToken: 'access' });
  assert.equal(access.type, ACCESS_TOKEN_TYPE);
  assert.equal(access.token, 'access');
});

test('refresh mode fails clearly when the session has no refresh token', () => {
  assert.throws(
    () => selectSubjectToken({ exchange: 'refresh_token', accessToken: 'access' }),
    /offline_access/,
  );
});

test('exchange posts to the tenant token endpoint and returns only the provider token fields', async () => {
  const seen = {};
  const result = await exchangeFederatedToken({
    domain: 'dev-wvxvhbnjrgvgn26x.us.auth0.com',
    clientId: 'vault-client',
    clientSecret: 'vault-secret',
    subjectToken: 'auth0-access',
    subjectTokenType: ACCESS_TOKEN_TYPE,
    connection: 'google-oauth2',
    fetchImpl: async (url, options) => {
      seen.url = String(url);
      seen.body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          access_token: 'google-access',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
          token_type: 'Bearer',
          extra: 'drop-me',
        }),
      };
    },
  });

  assert.equal(seen.url, 'https://dev-wvxvhbnjrgvgn26x.us.auth0.com/oauth/token');
  assert.equal(seen.body.subject_token, 'auth0-access');
  assert.equal(seen.body.client_secret, 'vault-secret');
  assert.deepEqual(result, {
    access_token: 'google-access',
    expires_in: 3600,
    scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    token_type: 'Bearer',
  });
});

test('calendar calls use the exchanged bearer token and keep five events', async () => {
  const seen = {};
  const events = await listUpcomingEvents('google-access', {
    now: new Date('2026-11-09T12:00:00.000Z'),
    fetchImpl: async (url, options) => {
      seen.url = String(url);
      seen.authorization = options.headers.authorization;
      return {
        ok: true,
        json: async () => ({
          items: [
            { summary: 'Standup', start: { dateTime: '2026-11-09T15:00:00-08:00' }, location: 'Cafe' },
            { summary: '', start: { date: '2026-11-10' } },
          ],
        }),
      };
    },
  });

  assert.match(seen.url, /calendars\/primary\/events/);
  assert.match(seen.url, /timeMin=2026-11-09T12%3A00%3A00.000Z/);
  assert.equal(seen.authorization, 'Bearer google-access');
  assert.deepEqual(events, [
    { title: 'Standup', start: '2026-11-09T15:00:00-08:00', location: 'Cafe' },
    { title: '(untitled)', start: '2026-11-10', location: '' },
  ]);
});
