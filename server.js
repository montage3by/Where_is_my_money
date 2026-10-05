const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const plan = require('./plan');
const { info, searchCity, DEFAULT_CITY } = require('./info');

const PORT = Number(process.env.PORT) || 3000;
// На Railway сюда монтируется Volume, иначе отметки сбрасываются при каждом деплое.
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PASSWORD = process.env.APP_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

const validIds = new Set([
  ...plan.days.flatMap((d) => d.meals.map((m) => m.id)),
  ...plan.shopping.flatMap((c) => c.items.map((i) => i.id)),
]);
// Дела дня: todo:<YYYY-MM-DD>:<taskId>[:<subtask>], разовые — todo:once:<taskId>[:<subtask>]
const checkableIds = (tasks) => new Set(tasks.flatMap((t) =>
  t.subtasks ? t.subtasks.map((_, i) => `${t.id}:${i}`) : t.counter ? [] : [t.id]));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Распорядок будет меняться: каждый день запоминает свой список дел,
// чтобы прошлые дни в истории показывались так, как были.
const TZ = process.env.TZ_NAME || 'Asia/Tbilisi';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
// Список дел редактируется на сайте и живёт в state.routine; plan.routine — только начальный
// Дни недели — как Date.getDay(): 0 воскресенье … 6 суббота
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const dailyRoutine = (date) => state.routine.filter((t) => !t.once && (!t.date || t.date === date)
  && (!t.from || t.from <= date) && (!t.days || t.days.includes(weekday(date))));

function snapshotDay(date) {
  // Сегодня и будущее — всегда по актуальному плану; прошлое не трогаем, если уже сохранено
  if (!state.snapshots[date] || date >= today()) state.snapshots[date] = dailyRoutine(date);
}

function isValidId(id) {
  if (validIds.has(id)) return true;
  const m = /^todo:(\d{4}-\d{2}-\d{2}|once):(.+)$/.exec(String(id));
  if (!m) return false;
  if (m[1] === 'once') return checkableIds(state.routine.filter((t) => t.once)).has(m[2]);
  return checkableIds(state.routine.filter((t) => !t.once)).has(m[2])
    || Boolean(state.snapshots[m[1]] && checkableIds(state.snapshots[m[1]]).has(m[2]));
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      checks: s.checks || {}, weights: s.weights || [], counters: s.counters || {}, snapshots: s.snapshots || {},
      routine: s.routine || structuredClone(plan.routine),
      settings: { city: DEFAULT_CITY, ...s.settings },
      food: s.food || {},
    };
  } catch {
    return { checks: {}, weights: [], counters: {}, snapshots: {}, routine: structuredClone(plan.routine), settings: { city: DEFAULT_CITY }, food: {} };
  }
}

// Дело из формы на сайте → проверенный объект. Ошибки — понятным текстом для пользователя.
function cleanTask(input, existing) {
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const title = str(input.title, 120);
  if (!title) throw new Error('Нужно название');
  const t = { id: existing ? existing.id : 't' + crypto.randomBytes(4).toString('hex'), title };
  if (existing && existing.meal !== undefined) t.meal = existing.meal;
  for (const k of ['start', 'end']) {
    const v = str(input[k], 5);
    if (!v) continue;
    if (!TIME_RE.test(v)) throw new Error('Время — в формате ЧЧ:ММ');
    t[k] = v;
  }
  if (t.start && t.end && t.end <= t.start) throw new Error('Конец раньше начала');
  const details = str(input.details, 1000);
  if (details) t.details = details;
  if (input.kind === 'subtasks') {
    const subs = (Array.isArray(input.subtasks) ? input.subtasks : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 30);
    if (!subs.length) throw new Error('Добавь хотя бы один подпункт');
    t.subtasks = subs;
  } else if (input.kind === 'counter') {
    const target = Math.round(Number(input.target));
    if (!(target >= 1 && target <= 10000)) throw new Error('Цель — от 1 до 10000');
    // Свои шаги и единица (например, вода: мл, +250/+500); при правке через форму сохраняются
    const prev = existing && existing.counter;
    const unit = str(input.unit ?? prev?.unit ?? '', 10);
    const own = Array.isArray(input.steps) ? input.steps.map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 10000).slice(0, 4) : [];
    const steps = own.length ? own : prev?.unit ? prev.steps : target >= 50 ? [1, 5, 10] : target >= 10 ? [1, 5] : [1];
    // limit — счётчик-ограничение (сигареты): цель — не превысить, в «сделано» не идёт
    const limit = input.limit ?? prev?.limit ?? false;
    t.counter = { target, steps, ...(unit && { unit }), ...(limit && { limit: true }) };
  }
  if (input.when === 'date' || input.when === 'once') {
    const d = str(input.date, 10);
    if (!DATE_RE.test(d)) throw new Error('Нужна дата');
    if (input.when === 'date') t.date = d;
    else Object.assign(t, { once: true, from: d });
  } else {
    // Каждый день — дата необязательна: с какого дня начинать
    const d = str(input.date, 10);
    if (d && !DATE_RE.test(d)) throw new Error('Дата — в формате ГГГГ-ММ-ДД');
    if (d) t.from = d;
    if (Array.isArray(input.days)) {
      const days = [...new Set(input.days.map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6).sort();
      if (!days.length) throw new Error('Выбери хотя бы один день недели');
      if (days.length < 7) t.days = days;
    }
  }
  return t;
}

let state = loadState();

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function authorized(req) {
  if (!PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const pass = Buffer.from(header.slice(6), 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pass);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

async function handleApi(req, res, route) {
  if (req.method === 'GET' && route === '/api/plan') return send(res, 200, { ...plan, routine: state.routine });
  if (req.method === 'GET' && route === '/api/state') return send(res, 200, state);
  if (req.method === 'GET' && route === '/api/info') return send(res, 200, await info(state.settings.city));
  if (req.method === 'GET' && route === '/api/geo') {
    const q = new URL(req.url, 'http://x').searchParams.get('q')?.trim().slice(0, 100);
    if (!q) return send(res, 200, []);
    try {
      return send(res, 200, await searchCity(q));
    } catch {
      return send(res, 502, { error: 'Поиск городов недоступен, попробуй ещё раз' });
    }
  }
  if (req.method === 'GET' && route === '/api/export') {
    res.setHeader('Content-Disposition', `attachment; filename="tracker-${new Date().toISOString().slice(0, 10)}.json"`);
    return send(res, 200, JSON.stringify(state, null, 2));
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, { error: 'bad json' });
  }

  if (route === '/api/check') {
    const ids = Array.isArray(body.ids) ? body.ids : [body.id];
    if (!ids.length || !ids.every(isValidId)) return send(res, 400, { error: 'unknown id' });
    const now = new Date().toISOString();
    for (const id of ids) {
      if (body.done) state.checks[id] = state.checks[id] || now;
      else delete state.checks[id];
      const m = /^todo:(\d{4}-\d{2}-\d{2}):/.exec(id);
      if (m) snapshotDay(m[1]);
    }
  } else if (route === '/api/counter') {
    const date = String(body.date);
    const tasks = [...state.routine, ...(state.snapshots[date] || [])];
    const task = tasks.find((t) => t.id === body.id && t.counter);
    const value = Math.round(Number(body.value));
    if (!task || !DATE_RE.test(date) || !(value >= 0 && value <= 10000)) return send(res, 400, { error: 'bad counter' });
    snapshotDay(date);
    const key = `${body.id}:${body.date}`;
    if (value) state.counters[key] = value;
    else delete state.counters[key];
  } else if (route === '/api/task') {
    const i = body.id ? state.routine.findIndex((t) => t.id === body.id) : -1;
    if (body.id && i < 0) return send(res, 404, { error: 'Дело не найдено' });
    let task;
    try {
      task = cleanTask(body, state.routine[i]);
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
    if (i >= 0) state.routine[i] = task;
    else state.routine.push(task);
  } else if (route === '/api/task/delete') {
    const before = state.routine.length;
    state.routine = state.routine.filter((t) => t.id !== body.id);
    if (state.routine.length === before) return send(res, 404, { error: 'Дело не найдено' });
  } else if (route === '/api/import') {
    // Восстановление из файла «Скачать все данные» — на случай потери данных при перезапуске без Volume
    const ok = (v, t) => v && typeof v === 'object' && Array.isArray(v) === t;
    if (!ok(body.checks, false) || !ok(body.counters, false) || !ok(body.weights, true) || !ok(body.routine, true)) {
      return send(res, 400, { error: 'Это не файл выгрузки трекера' });
    }
    state = {
      checks: body.checks, counters: body.counters, weights: body.weights, routine: body.routine,
      snapshots: ok(body.snapshots, false) ? body.snapshots : {},
      settings: { city: DEFAULT_CITY, ...(ok(body.settings, false) ? body.settings : {}) },
      food: ok(body.food, false) ? body.food : {},
    };
  } else if (route === '/api/settings/city') {
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name || !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return send(res, 400, { error: 'Неверный город' });
    const tz = /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(String(body.tz)) ? String(body.tz) : 'auto';
    state.settings.city = { name, country: String(body.country || '').slice(0, 80), lat, lon, tz };
  } else if (route === '/api/food') {
    // Дневник питания: что съедено на самом деле, по датам
    const date = String(body.date);
    const text = String(body.text || '').trim().slice(0, 300);
    const meal = String(body.meal || '').trim().slice(0, 30);
    const kcal = body.kcal === '' || body.kcal == null ? null : Math.round(Number(body.kcal));
    if (!DATE_RE.test(date) || !text || (kcal !== null && !(kcal >= 0 && kcal <= 5000))) return send(res, 400, { error: 'Нужно описание и калории числом' });
    (state.food[date] = state.food[date] || []).push({ id: crypto.randomBytes(4).toString('hex'), meal, text, kcal, at: new Date().toISOString() });
  } else if (route === '/api/food/delete') {
    const list = state.food[String(body.date)];
    if (!list) return send(res, 404, { error: 'Запись не найдена' });
    state.food[body.date] = list.filter((x) => x.id !== body.id);
    if (!state.food[body.date].length) delete state.food[body.date];
  } else if (route === '/api/reset') {
    const prefix = body.scope === 'meals' ? 'meal:' : body.scope === 'shopping' ? 'shop:' : null;
    if (!prefix) return send(res, 400, { error: 'scope must be meals or shopping' });
    for (const id of Object.keys(state.checks)) if (id.startsWith(prefix)) delete state.checks[id];
  } else if (route === '/api/weight') {
    const kg = Number(body.kg);
    const date = String(body.date || '');
    if (!DATE_RE.test(date) || !(kg > 20 && kg < 400)) return send(res, 400, { error: 'bad weight' });
    state.weights = state.weights.filter((w) => w.date !== date);
    state.weights.push({ date, kg: Math.round(kg * 10) / 10 });
    state.weights.sort((a, b) => a.date.localeCompare(b.date));
  } else if (route === '/api/weight/delete') {
    state.weights = state.weights.filter((w) => w.date !== body.date);
  } else {
    return send(res, 404, { error: 'not found' });
  }

  saveState();
  send(res, 200, state);
}

const server = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (route === '/health') return send(res, 200, { ok: true });
  // Иконки — без пароля: iOS скачивает иконку для экрана «Домой» без авторизации
  if (route === '/favicon.png' || route === '/apple-touch-icon.png') return serveStatic(req, res);
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="tracker", charset="UTF-8"' });
    return res.end('Auth required');
  }
  if (route.startsWith('/api/')) {
    handleApi(req, res, route).catch((e) => {
      console.error(e);
      send(res, 500, { error: 'internal error' });
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Tracker on :${PORT}, data in ${STATE_FILE}${PASSWORD ? ', password on' : ''}`);
});
