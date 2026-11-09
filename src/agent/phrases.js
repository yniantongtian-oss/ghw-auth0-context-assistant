const { LANGUAGE_LABELS } = require('../settings/validate');

const CONDITIONS = [
  { codes: [0], en: 'clear', es: 'despejado', fr: 'dégagé', de: 'klar', pt: 'limpo' },
  { codes: [1], en: 'mainly clear', es: 'mayormente despejado', fr: 'peu nuageux', de: 'überwiegend klar', pt: 'quase limpo' },
  { codes: [2], en: 'partly cloudy', es: 'parcialmente nublado', fr: 'partiellement nuageux', de: 'teilweise bewölkt', pt: 'parcialmente nublado' },
  { codes: [3], en: 'overcast', es: 'cubierto', fr: 'couvert', de: 'bedeckt', pt: 'encoberto' },
  { codes: [45, 48], en: 'foggy', es: 'con niebla', fr: 'brumeux', de: 'neblig', pt: 'com nevoeiro' },
  { codes: [51, 53, 55, 56, 57], en: 'drizzling', es: 'con llovizna', fr: 'bruineux', de: 'nieselig', pt: 'com chuvisco' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], en: 'rainy', es: 'lluvioso', fr: 'pluvieux', de: 'regnerisch', pt: 'chuvoso' },
  { codes: [71, 73, 75, 77, 85, 86], en: 'snowy', es: 'nevado', fr: 'neigeux', de: 'verschneit', pt: 'com neve' },
  { codes: [95, 96, 99], en: 'stormy', es: 'tormentoso', fr: 'orageux', de: 'gewitterhaft', pt: 'tempestuoso' },
];

const UNSETTLED = {
  en: 'unsettled',
  es: 'inestable',
  fr: 'instable',
  de: 'wechselhaft',
  pt: 'instável',
};

const HELP_LINES = {
  en: [
    'Try one of these:',
    "• What's the weather where I live?",
    "• What's the weather in Lisbon?",
    '• Set my home city to Portland',
    '• Use fahrenheit',
    '• Set my language to Spanish',
    '• Show my settings',
    "• What's on my calendar?",
  ],
  es: [
    'Prueba una de estas:',
    '• ¿Qué tiempo hace donde vivo?',
    '• ¿Qué tiempo hace en Lisboa?',
    '• Fija mi ciudad en Portland',
    '• Usa fahrenheit',
    '• Pon mi idioma en español',
    '• Muestra mis ajustes',
    '• ¿Qué hay en mi calendario?',
  ],
  fr: [
    'Essayez l’une de ces phrases :',
    '• Quel temps fait-il là où j’habite ?',
    '• Quel temps fait-il à Lisbonne ?',
    '• Définis ma ville sur Portland',
    '• Utilise fahrenheit',
    '• Mets ma langue en français',
    '• Montre mes réglages',
    '• Qu’y a-t-il sur mon calendrier ?',
  ],
  de: [
    'Probier einen dieser Sätze:',
    '• Wie ist das Wetter bei mir zu Hause?',
    '• Wie ist das Wetter in Lissabon?',
    '• Setze meine Stadt auf Portland',
    '• Benutze Fahrenheit',
    '• Stelle meine Sprache auf Deutsch',
    '• Zeig meine Einstellungen',
    '• Was steht in meinem Kalender?',
  ],
  pt: [
    'Experimente uma destas:',
    '• Qual é o tempo onde eu moro?',
    '• Qual é o tempo em Lisboa?',
    '• Define a minha cidade como Portland',
    '• Usa fahrenheit',
    '• Define o meu idioma para português',
    '• Mostra as minhas definições',
    '• O que há no meu calendário?',
  ],
};

function languageOf(language) {
  return HELP_LINES[language] ? language : 'en';
}

function helpText(language = 'en') {
  return HELP_LINES[languageOf(language)].join('\n');
}

function describeCondition(code, language) {
  const lang = languageOf(language);
  const group = CONDITIONS.find((item) => item.codes.includes(Number(code)));
  if (!group) return UNSETTLED[lang];
  return group[lang];
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value ?? '');
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function placeLabel(weather) {
  return weather.country ? `${weather.city}, ${weather.country}` : weather.city;
}

function formatWeather({ weather, language, usedHomeCity }) {
  const lang = languageOf(language);
  const facts = {
    temp: formatNumber(weather.temperature),
    tempUnit: weather.temperatureUnit,
    wind: formatNumber(weather.wind),
    windUnit: weather.windUnit,
    condition: describeCondition(weather.weatherCode, lang),
    place: placeLabel(weather),
  };
  const sentences = {
    en: usedHomeCity
      ? `It's ${facts.temp}${facts.tempUnit} and ${facts.condition} in ${facts.place}, with wind at ${facts.wind} ${facts.windUnit}. This uses your saved home city and unit preference.`
      : `It's ${facts.temp}${facts.tempUnit} and ${facts.condition} in ${facts.place}, with wind at ${facts.wind} ${facts.windUnit}. Temperature units come from your saved preferences.`,
    es: usedHomeCity
      ? `Hace ${facts.temp}${facts.tempUnit} y está ${facts.condition} en ${facts.place}, con viento de ${facts.wind} ${facts.windUnit}. Usé tu ciudad de origen y tus unidades guardadas.`
      : `Hace ${facts.temp}${facts.tempUnit} y está ${facts.condition} en ${facts.place}, con viento de ${facts.wind} ${facts.windUnit}. Las unidades salen de tus preferencias guardadas.`,
    fr: usedHomeCity
      ? `Il fait ${facts.temp}${facts.tempUnit} et le temps est ${facts.condition} à ${facts.place}, avec un vent de ${facts.wind} ${facts.windUnit}. Cela utilise votre ville d'origine et vos unités enregistrées.`
      : `Il fait ${facts.temp}${facts.tempUnit} et le temps est ${facts.condition} à ${facts.place}, avec un vent de ${facts.wind} ${facts.windUnit}. Les unités viennent de vos préférences enregistrées.`,
    de: usedHomeCity
      ? `Es ist ${facts.temp}${facts.tempUnit} und ${facts.condition} in ${facts.place}, bei Wind von ${facts.wind} ${facts.windUnit}. Das verwendet deine gespeicherte Heimatstadt und Einheit.`
      : `Es ist ${facts.temp}${facts.tempUnit} und ${facts.condition} in ${facts.place}, bei Wind von ${facts.wind} ${facts.windUnit}. Die Einheiten stammen aus deinen gespeicherten Einstellungen.`,
    pt: usedHomeCity
      ? `Está ${facts.temp}${facts.tempUnit} e ${facts.condition} em ${facts.place}, com vento de ${facts.wind} ${facts.windUnit}. Isto usa a sua cidade de origem e as unidades guardadas.`
      : `Está ${facts.temp}${facts.tempUnit} e ${facts.condition} em ${facts.place}, com vento de ${facts.wind} ${facts.windUnit}. As unidades vêm das suas preferências guardadas.`,
  };
  return sentences[lang];
}

function languageLabel(language) {
  const code = languageOf(language);
  return `${LANGUAGE_LABELS[code]} (${code})`;
}

function formatSettings(settings) {
  const lang = languageOf(settings.language);
  const city = settings.homeCity || {
    en: 'not set',
    es: 'sin definir',
    fr: 'non définie',
    de: 'nicht gesetzt',
    pt: 'não definida',
  }[lang];
  const lines = {
    en: `Home city: ${city}\nUnits: ${settings.units}\nLanguage: ${languageLabel(settings.language)}`,
    es: `Ciudad: ${city}\nUnidades: ${settings.units}\nIdioma: ${languageLabel(settings.language)}`,
    fr: `Ville: ${city}\nUnités: ${settings.units}\nLangue: ${languageLabel(settings.language)}`,
    de: `Stadt: ${city}\nEinheiten: ${settings.units}\nSprache: ${languageLabel(settings.language)}`,
    pt: `Cidade: ${city}\nUnidades: ${settings.units}\nIdioma: ${languageLabel(settings.language)}`,
  };
  return lines[lang];
}

function formatSaved(settings) {
  const lang = languageOf(settings.language);
  const city = settings.homeCity || {
    en: 'not set',
    es: 'sin definir',
    fr: 'non définie',
    de: 'nicht gesetzt',
    pt: 'não definida',
  }[lang];
  const label = languageLabel(settings.language);
  const lines = {
    en: `Saved. Home city: ${city}. Units: ${settings.units}. Language: ${label}.`,
    es: `Guardado. Ciudad: ${city}. Unidades: ${settings.units}. Idioma: ${label}.`,
    fr: `Enregistré. Ville: ${city}. Unités: ${settings.units}. Langue: ${label}.`,
    de: `Gespeichert. Stadt: ${city}. Einheiten: ${settings.units}. Sprache: ${label}.`,
    pt: `Guardado. Cidade: ${city}. Unidades: ${settings.units}. Idioma: ${label}.`,
  };
  return lines[lang];
}

function missingCityReply(language) {
  const replies = {
    en: "I don't know your home city yet. Tell me with: Set my home city to Lisbon.",
    es: 'Todavía no sé tu ciudad. Dime: Fija mi ciudad en Lisboa.',
    fr: 'Je ne connais pas encore votre ville. Dites: Définis ma ville sur Lisbonne.',
    de: 'Ich kenne deine Stadt noch nicht. Sag: Setze meine Stadt auf Lissabon.',
    pt: 'Ainda não sei a sua cidade. Diga: Define a minha cidade como Lisboa.',
  };
  return replies[languageOf(language)];
}

function tokenVaultDisabledReply(language) {
  const replies = {
    en: 'Calendar stays off until Auth0 Token Vault is enabled. Set ENABLE_TOKEN_VAULT=true after Google is connected and the federated token exchange is allowed. I will not call Google until then. The README has the dashboard steps.',
    es: 'El calendario sigue apagado hasta activar Auth0 Token Vault. Pon ENABLE_TOKEN_VAULT=true cuando Google esté conectado. No llamaré a Google antes. Los pasos están en el README.',
    fr: 'Le calendrier reste désactivé tant que Auth0 Token Vault n’est pas activé. Réglez ENABLE_TOKEN_VAULT=true après avoir connecté Google. Je n’appellerai pas Google avant. Les étapes sont dans le README.',
    de: 'Der Kalender bleibt aus, bis Auth0 Token Vault aktiv ist. Setze ENABLE_TOKEN_VAULT=true, nachdem Google verbunden ist. Ich rufe Google vorher nicht auf. Die Schritte stehen im README.',
    pt: 'O calendário fica desligado até ativar o Auth0 Token Vault. Defina ENABLE_TOKEN_VAULT=true depois de ligar o Google. Não vou chamar o Google antes. Os passos estão no README.',
  };
  return replies[languageOf(language)];
}

function formatEvents(events, language) {
  const lang = languageOf(language);
  if (!events.length) {
    return {
      en: 'Nothing upcoming on your primary Google Calendar.',
      es: 'No hay eventos próximos en tu calendario principal de Google.',
      fr: 'Rien à venir sur votre calendrier Google principal.',
      de: 'Keine anstehenden Einträge in deinem primären Google-Kalender.',
      pt: 'Não há eventos próximos no seu calendário principal do Google.',
    }[lang];
  }
  const header = {
    en: 'Next on your Google Calendar:',
    es: 'Lo próximo en tu Google Calendar:',
    fr: 'À venir sur votre Google Calendar :',
    de: 'Als Nächstes in deinem Google-Kalender:',
    pt: 'A seguir no seu Google Calendar:',
  }[lang];
  const lines = events.map((event) => {
    const when = formatWhen(event.start);
    const where = event.location ? ` (${event.location})` : '';
    return when ? `• ${event.title} — ${when}${where}` : `• ${event.title}${where}`;
  });
  return `${header}\n${lines.join('\n')}`;
}

function formatWhen(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  return String(value);
}

function emptyReply() {
  return "Send a message to get started. Try: What's the weather where I live?";
}

function unknownReply() {
  return `I can look up weather from your saved city, update those settings, and read your calendar once Token Vault is on.\n\n${helpText('en')}`;
}

module.exports = {
  helpText,
  describeCondition,
  formatWeather,
  formatSettings,
  formatSaved,
  missingCityReply,
  tokenVaultDisabledReply,
  formatEvents,
  emptyReply,
  unknownReply,
};
