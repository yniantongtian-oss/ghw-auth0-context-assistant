const fs = require('fs');
const os = require('os');
const path = require('path');
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SettingsStore } = require('../src/store/settings-store');
const { AUDIENCE, ISSUER, SECRET, jwtConfig, signToken } = require('./helpers');

const settingsFile = path.join(os.tmpdir(), `context-settings-${process.pid}-${Date.now()}.json`);
let app;

before(() => {
  app = createApp({
    store: new SettingsStore(settingsFile),
    config: {
      publicDir: path.join(__dirname, '..', 'public'),
      internalBaseUrl: 'http://127.0.0.1:9',
      auth0: {
        enabled: false,
        domain: 'dev-wvxvhbnjrgvgn26x.us.auth0.com',
        audience: AUDIENCE,
      },
      jwt: jwtConfig(),
      llm: { apiKey: '' },
      tokenVault: { enabled: false },
    },
  });
});

after(() => {
  fs.rmSync(settingsFile, { force: true });
});

test('rejects a settings request with no token', async () => {
  const response = await request(app).get('/api/settings');
  assert.equal(response.status, 401);
  assert.equal(response.body.homeCity, undefined);
});

test('rejects a settings write with no token', async () => {
  const response = await request(app)
    .put('/api/settings')
    .send({ homeCity: 'Portland' });
  assert.equal(response.status, 401);
  assert.equal(response.body.homeCity, undefined);
});

test('rejects a malformed bearer token', async () => {
  const response = await request(app)
    .get('/api/settings')
    .set('Authorization', 'Bearer not-a-jwt');
  assert.equal(response.status, 401);
  assert.equal(response.body.homeCity, undefined);
});

test('rejects a token signed with the wrong secret', async () => {
  const token = signToken({ sub: 'auth0|ada' }, 'another-secret-another-secret-xyz');
  const response = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 401);
});

test('rejects a token for the wrong audience', async () => {
  const token = signToken({ aud: 'https://example.invalid' });
  const response = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 401);
});

test('rejects a token from the wrong issuer', async () => {
  const token = signToken({ iss: 'https://evil.example/' });
  const response = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 401);
});

test('rejects an expired token', async () => {
  const token = signToken({ exp: Math.floor(Date.now() / 1000) - 60 });
  const response = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 401);
});

test('rejects an unsigned alg=none token', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: 'auth0|ada',
    iss: ISSUER,
    aud: AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 600,
  })).toString('base64url');
  const response = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${header}.${body}.`);
  assert.equal(response.status, 401);
});

test('accepts a valid token and isolates settings by sub', async () => {
  const ada = signToken({ sub: 'auth0|ada' });
  const grace = signToken({ sub: 'auth0|grace' });

  const saved = await request(app)
    .put('/api/settings')
    .set('Authorization', `Bearer ${ada}`)
    .send({ homeCity: 'Portland', units: 'fahrenheit', language: 'en' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.homeCity, 'Portland');
  assert.equal(saved.body.sub, 'auth0|ada');

  const adaRead = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${ada}`);
  assert.equal(adaRead.status, 200);
  assert.equal(adaRead.body.units, 'fahrenheit');

  const graceRead = await request(app)
    .get('/api/settings')
    .set('Authorization', `Bearer ${grace}`);
  assert.equal(graceRead.status, 200);
  assert.equal(graceRead.body.homeCity, null);
  assert.equal(graceRead.body.persisted, false);
  assert.notEqual(graceRead.body.sub, adaRead.body.sub);
});

test('the configured test issuer and secret stay local', () => {
  assert.equal(jwtConfig().secret, SECRET);
  assert.equal(jwtConfig().issuer, ISSUER);
});
