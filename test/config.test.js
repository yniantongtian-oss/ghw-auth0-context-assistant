const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('placeholder credentials leave Universal Login disabled', () => {
  const config = loadConfig({
    AUTH0_DOMAIN: 'dev-wvxvhbnjrgvgn26x.us.auth0.com',
    AUTH0_CLIENT_ID: 'your_regular_web_app_client_id',
    AUTH0_CLIENT_SECRET: 'your_regular_web_app_client_secret',
    AUTH0_SECRET: 'replace_with_a_long_random_string',
    AUTH0_AUDIENCE: 'https://context-assistant.api',
    ENABLE_TOKEN_VAULT: 'false',
    OPENAI_API_KEY: '',
  });

  assert.equal(config.auth0.enabled, false);
  assert.equal(config.auth0.domain, 'dev-wvxvhbnjrgvgn26x.us.auth0.com');
  assert.equal(config.auth0.issuerBaseURL, 'https://dev-wvxvhbnjrgvgn26x.us.auth0.com');
  assert.equal(config.jwt.audience, 'https://context-assistant.api');
  assert.equal(config.tokenVault.enabled, false);
  assert.equal(config.llm.apiKey, '');
});

test('a real Regular Web App enables login against the challenge tenant', () => {
  const config = loadConfig({
    AUTH0_CLIENT_ID: 'client-id',
    AUTH0_CLIENT_SECRET: 'client-secret',
    AUTH0_SECRET: '12345678901234567890123456789012',
    ENABLE_TOKEN_VAULT: 'true',
    TOKEN_VAULT_CLIENT_ID: 'custom-api-client',
    TOKEN_VAULT_CLIENT_SECRET: 'custom-api-secret',
    OPENAI_API_KEY: 'sk-test',
  });

  assert.equal(config.auth0.enabled, true);
  assert.equal(config.auth0.audience, 'https://context-assistant.api');
  assert.equal(config.tokenVault.enabled, true);
  assert.equal(config.tokenVault.clientId, 'custom-api-client');
  assert.equal(config.tokenVault.clientSecret, 'custom-api-secret');
  assert.equal(config.llm.apiKey, 'sk-test');
});
