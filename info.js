// Погода в Батуми (Open-Meteo) и курсы валют (open.er-api.com) — бесплатно и без ключей.
// Сервер кэширует ответы и при сбое источника отдаёт последние известные данные.

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=41.6168&longitude=41.6367'
  + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
  + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
  + '&forecast_days=2&wind_speed_unit=ms&timezone=Asia/Tbilisi';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

const WEATHER_TTL = 30 * 60 * 1000;
const FX_TTL = 6 * 60 * 60 * 1000;

// Коды погоды WMO → значок и подпись
const WMO = [
  [[0], '☀️', 'ясно'], [[1], '🌤️', 'малооблачно'], [[2], '⛅', 'облачно'], [[3], '☁️', 'пасмурно'],
  [[45, 48], '🌫️', 'туман'], [[51, 53, 55, 56, 57], '🌦️', 'морось'], [[61, 63, 80, 81], '🌧️', 'дождь'],
  [[65, 82], '🌧️', 'ливень'], [[66, 67], '🌧️', 'ледяной дождь'], [[71, 73, 75, 77, 85, 86], '🌨️', 'снег'],
  [[95, 96, 99], '⛈️', 'гроза'],
];
const describe = (code) => {
  const hit = WMO.find(([codes]) => codes.includes(code));
  return hit ? { icon: hit[1], text: hit[2] } : { icon: '🌡️', text: '' };
};

async function getJson(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

async function loadWeather() {
  const w = await getJson(WEATHER_URL);
  const c = w.current;
  const d = w.daily;
  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    wind: Math.round(c.wind_speed_10m),
    ...describe(c.weather_code),
    days: d.time.map((date, i) => ({
      date,
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      rain: d.precipitation_probability_max[i],
      ...describe(d.weather_code[i]),
    })),
  };
}

async function loadFx() {
  const r = await getJson(FX_URL);
  if (r.result !== 'success') throw new Error('курсы недоступны');
  const { RUB, GEL, EUR } = r.rates; // сколько единиц валюты за 1 USD
  return {
    updated: r.time_last_update_utc,
    rates: [
      { from: 'USD', to: 'RUB', label: '$ → ₽', value: round(RUB, 2) },
      { from: 'EUR', to: 'RUB', label: '€ → ₽', value: round(RUB / EUR, 2) },
      { from: 'GEL', to: 'RUB', label: '₾ → ₽', value: round(RUB / GEL, 2) },
      { from: 'USD', to: 'GEL', label: '$ → ₾', value: round(GEL, 3) },
    ],
  };
}

const cache = {
  weather: { data: null, at: 0, ttl: WEATHER_TTL, load: loadWeather, pending: null },
  fx: { data: null, at: 0, ttl: FX_TTL, load: loadFx, pending: null },
};

async function get(key) {
  const c = cache[key];
  if (c.data && Date.now() - c.at < c.ttl) return c.data;
  c.pending = c.pending || c.load()
    .then((data) => Object.assign(c, { data, at: Date.now() }).data)
    .catch((e) => {
      console.error(`info ${key}:`, e.message);
      return c.data; // последние известные данные или null
    })
    .finally(() => (c.pending = null));
  return c.pending;
}

async function info() {
  const [weather, fx] = await Promise.all([get('weather'), get('fx')]);
  return { weather, fx };
}

module.exports = { info };
