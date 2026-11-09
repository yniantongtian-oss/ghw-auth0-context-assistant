const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

function displayWindUnit(unit, fallback) {
  if (!unit) return fallback;
  if (unit === 'mp/h') return 'mph';
  return unit;
}

async function getWeather({ city, units }, { fetchImpl = globalThis.fetch } = {}) {
  const geocodeUrl = new URL(GEOCODE_URL);
  geocodeUrl.searchParams.set('name', city);
  geocodeUrl.searchParams.set('count', '1');
  geocodeUrl.searchParams.set('language', 'en');
  geocodeUrl.searchParams.set('format', 'json');

  const geocodeResponse = await fetchImpl(geocodeUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': 'context-assistant/1.0 (mlh-ghw)',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!geocodeResponse.ok) {
    throw new Error(`Geocoding failed (${geocodeResponse.status}).`);
  }
  const geocode = await geocodeResponse.json();
  const place = geocode.results && geocode.results[0];
  if (!place) {
    const error = new Error(`I couldn't find a place named "${city}".`);
    error.code = 'city_not_found';
    throw error;
  }

  const temperatureUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const windSpeedUnit = units === 'fahrenheit' ? 'mph' : 'kmh';
  const forecastUrl = new URL(FORECAST_URL);
  forecastUrl.searchParams.set('latitude', String(place.latitude));
  forecastUrl.searchParams.set('longitude', String(place.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
  forecastUrl.searchParams.set('temperature_unit', temperatureUnit);
  forecastUrl.searchParams.set('wind_speed_unit', windSpeedUnit);
  forecastUrl.searchParams.set('timezone', 'auto');

  const forecastResponse = await fetchImpl(forecastUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': 'context-assistant/1.0 (mlh-ghw)',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!forecastResponse.ok) {
    throw new Error(`Forecast failed (${forecastResponse.status}).`);
  }
  const forecast = await forecastResponse.json();
  const current = forecast.current || {};
  const currentUnits = forecast.current_units || {};

  return {
    city: place.name,
    country: place.country || '',
    admin1: place.admin1 || '',
    latitude: place.latitude,
    longitude: place.longitude,
    temperature: current.temperature_2m,
    temperatureUnit: currentUnits.temperature_2m || (temperatureUnit === 'fahrenheit' ? '°F' : '°C'),
    wind: current.wind_speed_10m,
    windUnit: displayWindUnit(currentUnits.wind_speed_10m, windSpeedUnit === 'mph' ? 'mph' : 'km/h'),
    weatherCode: current.weather_code,
    units: temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
  };
}

module.exports = { getWeather };
