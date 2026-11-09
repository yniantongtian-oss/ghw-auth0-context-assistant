const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getWeather } = require('../src/services/weather');

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('forecast uses the saved units and the geocoded coordinates', async () => {
  const urls = [];
  const weather = await getWeather({ city: 'Lisbon', units: 'celsius' }, {
    fetchImpl: async (url) => {
      const href = String(url);
      urls.push(href);
      if (href.includes('geocoding-api')) {
        return jsonResponse({
          results: [{
            name: 'Lisbon',
            country: 'Portugal',
            latitude: 38.72,
            longitude: -9.13,
          }],
        });
      }
      return jsonResponse({
        current: { temperature_2m: 18.24, weather_code: 2, wind_speed_10m: 11 },
        current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
      });
    },
  });

  assert.match(urls[0], /name=Lisbon/);
  assert.match(urls[1], /latitude=38\.72/);
  assert.match(urls[1], /longitude=-9\.13/);
  assert.match(urls[1], /temperature_unit=celsius/);
  assert.match(urls[1], /wind_speed_unit=kmh/);
  assert.equal(weather.city, 'Lisbon');
  assert.equal(weather.temperature, 18.24);
  assert.equal(weather.temperatureUnit, '°C');
  assert.equal(weather.weatherCode, 2);
});

test('fahrenheit selects imperial Open-Meteo units', async () => {
  let forecastUrl = '';
  const forecast = await getWeather({ city: 'Austin', units: 'fahrenheit' }, {
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('geocoding-api')) {
        return jsonResponse({ results: [{ name: 'Austin', country: 'United States', latitude: 30.27, longitude: -97.74 }] });
      }
      forecastUrl = href;
      return jsonResponse({
        current: { temperature_2m: 70, weather_code: 1, wind_speed_10m: 5 },
        current_units: { temperature_2m: '°F', wind_speed_10m: 'mp/h' },
      });
    },
  });
  assert.match(forecastUrl, /temperature_unit=fahrenheit/);
  assert.match(forecastUrl, /wind_speed_unit=mph/);
  assert.equal(forecast.windUnit, 'mph');
  assert.equal(forecast.temperatureUnit, '°F');
});

test('an unknown city is reported without calling the forecast', async () => {
  const urls = [];
  await assert.rejects(
    () => getWeather({ city: 'Atlantis', units: 'celsius' }, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        return jsonResponse({ results: [] });
      },
    }),
    (error) => error.code === 'city_not_found',
  );
  assert.equal(urls.length, 1);
});
