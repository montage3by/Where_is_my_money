const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const plan = require('./plan');

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

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { checks: s.checks || {}, weights: s.weights || [] };
  } catch {
    return { checks: {}, weights: [] };
  }
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

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
  if (req.method === 'GET' && route === '/api/plan') return send(res, 200, plan);
  if (req.method === 'GET' && route === '/api/state') return send(res, 200, state);

  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, { error: 'bad json' });
  }

  if (route === '/api/check') {
    if (!validIds.has(body.id)) return send(res, 400, { error: 'unknown id' });
    if (body.done) state.checks[body.id] = new Date().toISOString();
    else delete state.checks[body.id];
  } else if (route === '/api/reset') {
    const prefix = body.scope === 'meals' ? 'meal:' : body.scope === 'shopping' ? 'shop:' : null;
    if (!prefix) return send(res, 400, { error: 'scope must be meals or shopping' });
    for (const id of Object.keys(state.checks)) if (id.startsWith(prefix)) delete state.checks[id];
  } else if (route === '/api/weight') {
    const kg = Number(body.kg);
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(kg > 20 && kg < 400)) return send(res, 400, { error: 'bad weight' });
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
