const LANGUAGE_ALIASES = {
  english: 'en',
  en: 'en',
  spanish: 'es',
  espanol: 'es',
  español: 'es',
  es: 'es',
  french: 'fr',
  francais: 'fr',
  français: 'fr',
  fr: 'fr',
  german: 'de',
  deutsch: 'de',
  de: 'de',
  portuguese: 'pt',
  portugues: 'pt',
  português: 'pt',
  pt: 'pt',
};

const LANGUAGE_LABELS = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
};

function normalizeUnits(value) {
  const units = String(value || '').trim().toLowerCase();
  if (units === 'metric' || units === 'c' || units === 'celsius') return 'celsius';
  if (units === 'imperial' || units === 'f' || units === 'fahrenheit') return 'fahrenheit';
  return null;
}

function normalizeLanguage(value) {
  const language = String(value || '').trim().toLowerCase();
  return LANGUAGE_ALIASES[language] || null;
}

function validateSettingsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Expected a JSON object with homeCity, units, or language.' };
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'homeCity')) {
    if (typeof body.homeCity !== 'string') {
      return { ok: false, error: 'homeCity must be a string.' };
    }
    const city = body.homeCity.trim().replace(/\s+/g, ' ');
    if (city.length < 1 || city.length > 80) {
      return { ok: false, error: 'homeCity must be 1–80 characters.' };
    }
    if (!/^[\p{L}\p{M}\s.'’,-]+$/u.test(city)) {
      return { ok: false, error: 'homeCity contains unsupported characters.' };
    }
    patch.homeCity = city;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'units')) {
    const units = normalizeUnits(body.units);
    if (!units) return { ok: false, error: 'units must be celsius or fahrenheit.' };
    patch.units = units;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'language')) {
    const language = normalizeLanguage(body.language);
    if (!language) return { ok: false, error: 'language must be one of en, es, fr, de, pt.' };
    patch.language = language;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'Provide homeCity, units, or language.' };
  }

  return { ok: true, value: patch };
}

module.exports = {
  LANGUAGE_LABELS,
  normalizeUnits,
  normalizeLanguage,
  validateSettingsPatch,
};
