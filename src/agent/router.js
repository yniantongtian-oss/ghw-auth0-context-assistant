const { normalizeLanguage, normalizeUnits, validateSettingsPatch } = require('../settings/validate');
const {
  emptyReply,
  formatEvents,
  formatSaved,
  formatSettings,
  formatWeather,
  helpText,
  missingCityReply,
  tokenVaultDisabledReply,
  unknownReply,
} = require('./phrases');

function cleanTail(value) {
  return String(value || '').trim().replace(/[?.!]+$/g, '').trim();
}

function explicitPlace(text) {
  const match = text.match(/\b(?:weather|forecast|temperature)\b.*?\b(?:in|for|at)\s+(.+)$/i);
  if (!match) return null;
  const city = cleanTail(match[1]);
  if (!city) return null;
  if (/^(where i live|my (home )?city|home)$/i.test(city)) return null;
  return city;
}

function detectIntent(message) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  if (!text) return { type: 'empty' };

  let match = text.match(/\b(?:set|update|change)\s+(?:my\s+)?(?:home\s+)?city\s+to\s+(.+)$/i);
  if (match) return { type: 'set_city', city: cleanTail(match[1]) };

  match = lower.match(/\b(?:set|switch|change|use)\s+(?:my\s+)?(?:units?|temperature)\s+(?:to\s+)?(celsius|fahrenheit|metric|imperial)\b/);
  if (match) return { type: 'set_units', units: normalizeUnits(match[1]) };

  match = lower.match(/\buse\s+(celsius|fahrenheit|metric|imperial)\b/);
  if (match) return { type: 'set_units', units: normalizeUnits(match[1]) };

  match = text.match(/\b(?:set|switch|change|use)\s+(?:my\s+)?(?:preferred\s+)?language\s+to\s+([^\s?.!]+)/i);
  if (match) return { type: 'set_language', language: match[1] };

  if (/\b(calendar|schedule|agenda)\b/.test(lower) || /\bmy events\b/.test(lower)) {
    return { type: 'calendar' };
  }

  if (/\b(settings|preferences|profile)\b/.test(lower)) {
    return { type: 'settings' };
  }

  if (/\b(weather|forecast|temperature)\b/.test(lower) || /\bhow (hot|cold|warm)\b/.test(lower)) {
    const city = explicitPlace(text);
    if (city) return { type: 'weather', citySource: 'explicit', city };
    return { type: 'weather', citySource: 'settings' };
  }

  if (/^(hi|hello|hey|help)[!. ]*$/i.test(text) || /\bwhat can you do\b/i.test(lower)) {
    return { type: 'help' };
  }

  return { type: 'unknown' };
}

async function finish(deps, result, message) {
  if (!deps.complete) return result;
  try {
    const polished = await deps.complete({
      intent: result.intent,
      message,
      settings: result.settings,
      draft: result.reply,
    });
    if (typeof polished !== 'string' || !polished.trim()) return result;
    return {
      ...result,
      reply: polished.trim(),
      toolCalls: [...result.toolCalls, { api: 'llm', operation: 'complete' }],
    };
  } catch {
    return result;
  }
}

function baseResult(intent, reply, settings = null, toolCalls = []) {
  return { intent, reply, settings, toolCalls };
}

async function handleMessage(message, deps) {
  const intent = detectIntent(message);

  if (intent.type === 'empty') {
    return baseResult('empty', emptyReply());
  }
  if (intent.type === 'help') {
    return baseResult('help', helpText('en'));
  }
  if (intent.type === 'unknown') {
    if (!deps.complete) return baseResult('unknown', unknownReply());
    const settings = await deps.getSettings();
    const draft = unknownReply();
    const polished = await finish(deps, baseResult('unknown', draft, settings, [
      { api: 'first-party', operation: 'getSettings' },
    ]), message);
    return polished;
  }

  const settings = await deps.getSettings();
  const toolCalls = [{ api: 'first-party', operation: 'getSettings' }];

  if (intent.type === 'settings') {
    return finish(deps, baseResult('settings', formatSettings(settings), settings, toolCalls), message);
  }

  if (intent.type === 'set_city' || intent.type === 'set_units' || intent.type === 'set_language') {
    const raw = intent.type === 'set_city'
      ? { homeCity: intent.city }
      : intent.type === 'set_units'
        ? { units: intent.units }
        : { language: intent.language };
    if (intent.type === 'set_language') {
      raw.language = normalizeLanguage(intent.language) || intent.language;
    }
    const parsed = validateSettingsPatch(raw);
    if (!parsed.ok) {
      return finish(deps, baseResult(intent.type, parsed.error, settings, toolCalls), message);
    }
    const updated = await deps.updateSettings(parsed.value);
    toolCalls.push({
      api: 'first-party',
      operation: 'updateSettings',
      fields: Object.keys(parsed.value),
    });
    return finish(deps, baseResult(intent.type, formatSaved(updated), updated, toolCalls), message);
  }

  if (intent.type === 'calendar') {
    if (!deps.tokenVaultEnabled || typeof deps.getCalendar !== 'function') {
      return finish(deps, baseResult('calendar', tokenVaultDisabledReply(settings.language), settings, toolCalls), message);
    }
    try {
      const events = await deps.getCalendar();
      toolCalls.push({ api: 'token-vault', operation: 'google-calendar' });
      return finish(deps, baseResult('calendar', formatEvents(events, settings.language), settings, toolCalls), message);
    } catch (error) {
      return finish(deps, baseResult('calendar', `I couldn't read your calendar. ${error.message}`, settings, toolCalls), message);
    }
  }

  const city = intent.citySource === 'explicit' ? intent.city : settings.homeCity;
  if (!city) {
    return finish(deps, baseResult('weather', missingCityReply(settings.language), settings, toolCalls), message);
  }

  try {
    const weather = await deps.getWeather({ city, units: settings.units });
    toolCalls.push({
      api: 'open-meteo',
      operation: 'forecast',
      city,
      units: settings.units,
    });
    return finish(deps, baseResult('weather', formatWeather({
      weather,
      language: settings.language,
      usedHomeCity: intent.citySource !== 'explicit',
    }), settings, toolCalls), message);
  } catch (error) {
    const reply = error.code === 'city_not_found'
      ? error.message
      : `I couldn't reach the weather service. ${error.message}`;
    return finish(deps, baseResult('weather', reply, settings, toolCalls), message);
  }
}

module.exports = { detectIntent, handleMessage };
