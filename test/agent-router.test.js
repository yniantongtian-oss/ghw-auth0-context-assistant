const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleMessage } = require('../src/agent/router');

function settings(overrides = {}) {
  return {
    sub: 'auth0|ada',
    homeCity: 'Portland',
    units: 'fahrenheit',
    language: 'en',
    persisted: true,
    ...overrides,
  };
}

function weather(overrides = {}) {
  return {
    city: 'Portland',
    country: 'United States',
    temperature: 52,
    temperatureUnit: '°F',
    wind: 8,
    windUnit: 'mph',
    weatherCode: 0,
    units: 'fahrenheit',
    ...overrides,
  };
}

function deps(overrides = {}) {
  const calls = [];
  const base = {
    calls,
    getSettings: async () => {
      calls.push('getSettings');
      return settings();
    },
    updateSettings: async (patch) => {
      calls.push(['updateSettings', patch]);
      return settings(patch);
    },
    getWeather: async (args) => {
      calls.push(['getWeather', args]);
      return weather({ city: args.city, units: args.units, temperatureUnit: args.units === 'fahrenheit' ? '°F' : '°C' });
    },
    tokenVaultEnabled: false,
    ...overrides,
  };
  return base;
}

test("weather where I live reads the saved city and units", async () => {
  const api = deps();
  const result = await handleMessage("What's the weather where I live?", api);
  assert.equal(result.intent, 'weather');
  assert.deepEqual(api.calls[1], ['getWeather', { city: 'Portland', units: 'fahrenheit' }]);
  assert.equal(
    result.reply,
    "It's 52°F and clear in Portland, United States, with wind at 8 mph. This uses your saved home city and unit preference.",
  );
  assert.equal(result.toolCalls[0].api, 'first-party');
  assert.equal(result.toolCalls[1].api, 'open-meteo');
});

test('a bare weather question also uses the saved home city', async () => {
  const api = deps();
  await handleMessage('How hot is it?', api);
  assert.deepEqual(api.calls[1], ['getWeather', { city: 'Portland', units: 'fahrenheit' }]);
});

test('asks for a home city before calling the weather API', async () => {
  const api = deps({
    getSettings: async () => settings({ homeCity: null, persisted: false }),
  });
  const result = await handleMessage("What's the weather where I live?", api);
  assert.equal(result.intent, 'weather');
  assert.match(result.reply, /Set my home city to Lisbon/);
  assert.equal(api.calls.includes('getWeather') || api.calls.some((call) => call[0] === 'getWeather'), false);
});

test('an explicit city still uses saved units', async () => {
  const api = deps();
  const result = await handleMessage("What's the weather in Lisbon?", api);
  assert.deepEqual(api.calls[1], ['getWeather', { city: 'Lisbon', units: 'fahrenheit' }]);
  assert.match(result.reply, /Lisbon/);
  assert.match(result.reply, /saved preferences/);
  assert.doesNotMatch(result.reply, /saved home city/);
});

test('spanish settings change the weather reply', async () => {
  const api = deps({
    getSettings: async () => settings({ homeCity: 'Lisboa', units: 'celsius', language: 'es' }),
    getWeather: async () => weather({
      city: 'Lisbon',
      country: 'Portugal',
      temperature: 18,
      temperatureUnit: '°C',
      wind: 12,
      windUnit: 'km/h',
      weatherCode: 0,
      units: 'celsius',
    }),
  });
  const result = await handleMessage("What's the weather where I live?", api);
  assert.match(result.reply, /^Hace 18°C y está despejado en Lisbon, Portugal/);
});

test('a missing place becomes a friendly reply', async () => {
  const api = deps({
    getWeather: async () => {
      const error = new Error('I couldn\'t find a place named "Atlantis".');
      error.code = 'city_not_found';
      throw error;
    },
  });
  const result = await handleMessage("What's the weather in Atlantis?", api);
  assert.match(result.reply, /Atlantis/);
  assert.equal(result.toolCalls.some((call) => call.api === 'open-meteo'), false);
});

test('set home city updates the first-party settings', async () => {
  const api = deps();
  api.getSettings = async () => {
    api.calls.push('getSettings');
    return settings({ homeCity: null, units: 'celsius' });
  };
  api.updateSettings = async (patch) => {
    api.calls.push(['updateSettings', patch]);
    return settings({ homeCity: null, units: 'celsius', ...patch });
  };
  const result = await handleMessage('Set my home city to Portland.', api);
  assert.equal(result.intent, 'set_city');
  assert.deepEqual(api.calls[1][1], { homeCity: 'Portland' });
  assert.equal(result.reply, 'Saved. Home city: Portland. Units: celsius. Language: English (en).');
});

test('rejects a city the settings API would refuse', async () => {
  const api = deps();
  const result = await handleMessage('Set my home city to Paris123', api);
  assert.match(result.reply, /unsupported characters/);
  assert.equal(api.calls.some((call) => Array.isArray(call) && call[0] === 'updateSettings'), false);
});

test('use fahrenheit stores imperial units', async () => {
  const api = deps();
  const result = await handleMessage('Use fahrenheit', api);
  assert.deepEqual(api.calls[1][1], { units: 'fahrenheit' });
  assert.match(result.reply, /fahrenheit/);
});

test('set language accepts a language name', async () => {
  const api = deps();
  api.updateSettings = async (patch) => {
    api.calls.push(['updateSettings', patch]);
    return settings(patch);
  };
  const result = await handleMessage('Set my language to Spanish', api);
  assert.deepEqual(api.calls[1][1], { language: 'es' });
  assert.match(result.reply, /Guardado/);
  assert.match(result.reply, /Spanish \(es\)/);
});

test('show my settings prints the saved profile', async () => {
  const api = deps();
  const result = await handleMessage('Show my settings', api);
  assert.equal(result.reply, 'Home city: Portland\nUnits: fahrenheit\nLanguage: English (en)');
  assert.deepEqual(api.calls, ['getSettings']);
});

test('calendar does not call Google when Token Vault is off', async () => {
  let calendarCalled = false;
  const api = deps({
    getCalendar: async () => {
      calendarCalled = true;
      return [];
    },
  });
  const result = await handleMessage("What's on my calendar?", api);
  assert.equal(result.intent, 'calendar');
  assert.equal(calendarCalled, false);
  assert.match(result.reply, /ENABLE_TOKEN_VAULT/);
  assert.equal(result.toolCalls.some((call) => call.api === 'token-vault'), false);
});

test('calendar uses the vault path when the flag is on', async () => {
  const api = deps({
    tokenVaultEnabled: true,
    getCalendar: async () => [{ title: 'Standup', start: '2026-11-10', location: '' }],
  });
  const result = await handleMessage('What is on my schedule?', api);
  assert.match(result.reply, /Standup — 2026-11-10/);
  assert.equal(result.toolCalls.some((call) => call.api === 'token-vault' && call.operation === 'google-calendar'), true);
});

test('a vault failure stays in the reply and does not throw', async () => {
  const api = deps({
    tokenVaultEnabled: true,
    getCalendar: async () => {
      throw new Error('Consent required for google-oauth2.');
    },
  });
  const result = await handleMessage('Show my agenda', api);
  assert.match(result.reply, /Consent required/);
});

test('unknown text without an LLM explains the commands', async () => {
  const api = deps();
  const result = await handleMessage('Write me a poem about moss', api);
  assert.equal(result.intent, 'unknown');
  assert.match(result.reply, /What's the weather where I live\?/);
  assert.deepEqual(api.calls, []);
});

test('an optional LLM can rephrase after the tools run', async () => {
  const api = deps({
    complete: async ({ draft }) => `POLISHED ${draft}`,
  });
  const result = await handleMessage("What's the weather where I live?", api);
  assert.match(result.reply, /^POLISHED It's 52°F/);
  assert.equal(result.toolCalls.at(-1).api, 'llm');
  assert.equal(api.calls.some((call) => Array.isArray(call) && call[0] === 'getWeather'), true);
});

test('an LLM failure keeps the deterministic reply', async () => {
  const api = deps({
    complete: async () => {
      throw new Error('llm down');
    },
  });
  const result = await handleMessage('Show my settings', api);
  assert.match(result.reply, /Home city: Portland/);
  assert.equal(result.toolCalls.some((call) => call.api === 'llm'), false);
});

test('an empty message does not call the APIs', async () => {
  const api = deps();
  const result = await handleMessage('   ', api);
  assert.equal(result.intent, 'empty');
  assert.deepEqual(api.calls, []);
});
