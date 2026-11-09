const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('node:events');
const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { SettingsStore } = require('../src/store/settings-store');
const { AUDIENCE, signToken, jwtConfig } = require('./helpers');

const servers = [];

after(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function startApp() {
  const settingsFile = path.join(os.tmpdir(), `context-chat-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const calls = [];
  let baseUrl = '';
  const app = createApp({
    store: new SettingsStore(settingsFile),
    getWeather: async ({ city, units }) => {
      calls.push({ city, units });
      return {
        city,
        country: city === 'Lisbon' ? 'Portugal' : 'United States',
        temperature: units === 'fahrenheit' ? 52 : 18,
        temperatureUnit: units === 'fahrenheit' ? '°F' : '°C',
        wind: units === 'fahrenheit' ? 8 : 12,
        windUnit: units === 'fahrenheit' ? 'mph' : 'km/h',
        weatherCode: 0,
        units,
      };
    },
    config: {
      publicDir: path.join(__dirname, '..', 'public'),
      resolveInternalBaseUrl: () => baseUrl,
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
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  servers.push(server);
  return { baseUrl, calls, settingsFile };
}

test('a chat turn reads settings through the JWT API before the forecast', async () => {
  const { baseUrl, calls, settingsFile } = await startApp();
  const token = signToken({ sub: 'auth0|ada' });
  try {
    const saved = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ homeCity: 'Portland', units: 'fahrenheit', language: 'en' }),
    });
    assert.equal(saved.status, 200);

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: "What's the weather where I live?" }),
    });
    const body = await chat.json();
    assert.equal(chat.status, 200);
    assert.equal(body.intent, 'weather');
    assert.deepEqual(calls, [{ city: 'Portland', units: 'fahrenheit' }]);
    assert.match(body.reply, /52°F and clear in Portland, United States/);
    assert.match(body.reply, /saved home city/);
    assert.equal(body.toolCalls.some((call) => call.api === 'first-party' && call.operation === 'getSettings'), true);
    assert.equal(body.toolCalls.some((call) => call.api === 'open-meteo' && call.city === 'Portland'), true);

    const elsewhere = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: "What's the weather in Lisbon?" }),
    });
    const other = await elsewhere.json();
    assert.equal(elsewhere.status, 200);
    assert.deepEqual(calls[1], { city: 'Lisbon', units: 'fahrenheit' });
    assert.match(other.reply, /Lisbon, Portugal/);
  } finally {
    fs.rmSync(settingsFile, { force: true });
  }
});

test('chat rejects a missing or invalid access token', async () => {
  const { baseUrl, calls, settingsFile } = await startApp();
  try {
    const missing = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: "What's the weather where I live?" }),
    });
    assert.equal(missing.status, 401);

    const invalid = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer not-a-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: "What's the weather where I live?" }),
    });
    assert.equal(invalid.status, 401);
    assert.equal(calls.length, 0);
  } finally {
    fs.rmSync(settingsFile, { force: true });
  }
});

test('the logged-out page is served', async () => {
  const { baseUrl, settingsFile } = await startApp();
  try {
    const page = await fetch(`${baseUrl}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Context Assistant/);
    assert.match(html, /What's the weather where I live\?/);

    const session = await fetch(`${baseUrl}/api/session`);
    const body = await session.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.audience, 'https://context-assistant.api');
    assert.equal(body.domain, 'dev-wvxvhbnjrgvgn26x.us.auth0.com');
  } finally {
    fs.rmSync(settingsFile, { force: true });
  }
});
