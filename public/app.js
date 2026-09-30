const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => n.toFixed(2).replace(/\.00$/, '') + ' ₾';

let plan;
let state = { checks: {}, weights: [], counters: {} };
const todayIdx = (new Date().getDay() + 6) % 7; // Пн = 0
let selectedDay = todayIdx;
let hideBought = false;
let todoOffset = 0; // дней от сегодня
const expanded = new Set();

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function todoDay() {
  const d = new Date();
  d.setDate(d.getDate() + todoOffset);
  return d;
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3000);
}

const isDone = (id) => Boolean(state.checks[id]);

async function toggle(id, done) {
  const prev = state.checks[id];
  if (done) state.checks[id] = new Date().toISOString();
  else delete state.checks[id];
  render();
  try {
    state = await api('/api/check', { id, done });
  } catch (e) {
    if (prev) state.checks[id] = prev;
    else delete state.checks[id];
    toast('Не сохранилось: ' + e.message);
  }
  render();
}

function taskHtml({ id, title, meta, right }) {
  return `<label class="task${isDone(id) ? ' done' : ''}">
    <input type="checkbox" data-id="${id}"${isDone(id) ? ' checked' : ''}>
    <div class="body">${meta ? `<div class="meta">${meta}</div>` : ''}<div class="title">${esc(title)}</div></div>
    ${right ? `<div class="right">${right}</div>` : ''}
  </label>`;
}

// ——— Дела ———
const subIds = (date, t) => t.subtasks.map((_, i) => `todo:${date}:${t.id}:${i}`);
const count = (date, t) => state.counters[`${t.id}:${date}`] || 0;

function taskProgress(date, t) {
  if (t.counter) return { done: count(date, t) >= t.counter.target, n: count(date, t), of: t.counter.target };
  if (t.subtasks) {
    const n = subIds(date, t).filter(isDone).length;
    return { done: n === t.subtasks.length, n, of: t.subtasks.length };
  }
  return { done: isDone(`todo:${date}:${t.id}`) };
}

function taskStatus(t, done, date) {
  if (done) return '';
  const today = ymd(new Date());
  if (date < today) return 'late';
  if (date > today) return '';
  const now = hm(new Date());
  if (t.end && now >= t.end) return 'late';
  if (t.start && now >= t.start && (!t.end || now < t.end)) return 'now';
  return '';
}

function counterHtml(date, t) {
  const n = count(date, t);
  const { target, steps } = t.counter;
  return `<div class="counter">
    <div class="counter-top"><span class="big">${n}</span><span class="kcal">из ${target}</span></div>
    <div class="bar"><span style="width:${Math.min(100, (n / target) * 100)}%"></span></div>
    <div class="counter-btns">
      <button data-count="${t.id}" data-step="-1">−1</button>
      ${steps.map((st) => `<button data-count="${t.id}" data-step="${st}" class="plus">+${st}</button>`).join('')}
    </div>
  </div>`;
}

function renderTodos() {
  const day = todoDay();
  const date = ymd(day);
  const label = day.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const rel = { 0: 'сегодня', '-1': 'вчера', 1: 'завтра' }[todoOffset];
  $('#todo-date').textContent = label + (rel ? ` · ${rel}` : '');

  const progress = plan.routine.map((t) => taskProgress(date, t));
  $('#todo-progress').textContent = `Сделано ${progress.filter((p) => p.done).length} из ${plan.routine.length}`;

  $('#todo-list').innerHTML = plan.routine.map((t, i) => {
    const p = progress[i];
    const status = taskStatus(t, p.done, date);
    const expandable = Boolean(t.subtasks || t.counter || t.details);
    const open = expandable && expanded.has(t.id);
    const time = t.start ? `${t.start}–${t.end}` : t.end ? `до ${t.end}` : '';

    let check;
    if (t.counter) check = `<span class="ring${p.done ? ' full' : ''}" style="--p:${Math.min(1, p.n / p.of)}"></span>`;
    else if (t.subtasks) check = `<input type="checkbox" class="cb" data-group="${t.id}"${p.done ? ' checked' : ''} aria-label="Отметить всё">`;
    else check = `<input type="checkbox" class="cb" data-id="todo:${date}:${t.id}"${p.done ? ' checked' : ''}>`;

    const badge = status === 'now' ? '<span class="badge">сейчас</span>' : '';
    const countLabel = p.of ? `<span class="kcal">${p.n}/${p.of}</span>` : '';

    let body = '';
    if (open) {
      body = `<div class="todo-body">
        ${t.details ? `<p class="details">${esc(t.details)}</p>` : ''}
        ${t.subtasks ? t.subtasks.map((st, si) => taskHtml({ id: `todo:${date}:${t.id}:${si}`, title: st })).join('') : ''}
        ${t.counter ? counterHtml(date, t) : ''}
      </div>`;
    }

    return `<div class="todo card ${p.done ? 'done' : ''} ${status}">
      <div class="todo-row">
        ${check}
        <button class="todo-main" ${expandable ? `data-expand="${t.id}" aria-expanded="${open}"` : 'tabindex="-1"'}>
          <span class="body">
            <span class="meta"><b>${time}</b>${badge}</span>
            <span class="title">${esc(t.title)}</span>
          </span>
          ${countLabel}
          ${expandable ? `<span class="chev">${open ? '▴' : '▾'}</span>` : ''}
        </button>
      </div>
      ${body}
    </div>`;
  }).join('');
}

async function setGroup(taskId, done) {
  const date = ymd(todoDay());
  const t = plan.routine.find((x) => x.id === taskId);
  const ids = subIds(date, t);
  const prev = Object.fromEntries(ids.map((id) => [id, state.checks[id]]));
  ids.forEach((id) => (done ? (state.checks[id] = state.checks[id] || new Date().toISOString()) : delete state.checks[id]));
  render();
  try {
    state = await api('/api/check', { ids, done });
  } catch (e) {
    ids.forEach((id) => (prev[id] ? (state.checks[id] = prev[id]) : delete state.checks[id]));
    toast('Не сохранилось: ' + e.message);
  }
  render();
}

let counterSeq = 0;
async function bumpCounter(taskId, step) {
  const date = ymd(todoDay());
  const t = plan.routine.find((x) => x.id === taskId);
  const key = `${taskId}:${date}`;
  const value = Math.max(0, count(date, t) + step);
  if (value) state.counters[key] = value;
  else delete state.counters[key];
  renderTodos();
  const seq = ++counterSeq;
  try {
    await api('/api/counter', { id: taskId, date, value });
  } catch (e) {
    toast('Не сохранилось: ' + e.message);
    if (seq === counterSeq) refresh();
  }
}

function renderMeals() {
  $('#days').innerHTML = plan.days.map((d, i) => `
    <button class="day${i === todayIdx ? ' today' : ''}" data-day="${i}" aria-pressed="${i === selectedDay}">
      ${d.short}
      <span class="dots">${d.meals.map((m) => `<i class="${isDone(m.id) ? 'on' : ''}"></i>`).join('')}</span>
    </button>`).join('');

  const day = plan.days[selectedDay];
  const total = day.meals.reduce((s, m) => s + m.kcal, 0);
  const eaten = day.meals.filter((m) => isDone(m.id)).reduce((s, m) => s + m.kcal, 0);
  $('#day-card').innerHTML = `
    <div class="day-head">
      <h2>${day.name}${selectedDay === todayIdx ? ' · сегодня' : ''}</h2>
      <span class="kcal">${eaten} / ~${total} ккал</span>
    </div>
    <div class="bar"><span style="width:${(eaten / total) * 100}%"></span></div>
    ${day.meals.map((m) => taskHtml({
      id: m.id,
      title: m.dish,
      meta: `<b>${m.time}</b><span>${esc(m.type)}</span>`,
      right: `~${m.kcal}`,
    })).join('')}`;
}

function renderShop() {
  const items = plan.shopping.flatMap((c) => c.items);
  const total = items.reduce((s, i) => s + i.price, 0);
  const bought = items.filter((i) => isDone(i.id));
  const spent = bought.reduce((s, i) => s + i.price, 0);
  $('#shop-stat').innerHTML = `
    <div><div class="big">${bought.length} / ${items.length}</div><div class="kcal">${money(spent)} из ~${money(total)}</div></div>
    <div class="bar"><span style="width:${(bought.length / items.length) * 100}%"></span></div>`;

  $('#shop-list').innerHTML = plan.shopping.map((c) => {
    const left = c.items.filter((i) => !isDone(i.id));
    const shown = hideBought ? left : c.items;
    if (!shown.length) return '';
    return `<div class="cat${left.length ? '' : ' all-done'}"><span>${esc(c.category)}</span><span>${c.items.length - left.length}/${c.items.length}</span></div>
      <div class="card">${shown.map((i) => taskHtml({ id: i.id, title: i.name, meta: esc(i.qty), right: money(i.price) })).join('')}</div>`;
  }).join('') || '<div class="card"><p class="empty">Всё куплено 🎉</p></div>';
}

function renderWeights() {
  const ws = state.weights;
  if (!ws.length) {
    $('#weights').innerHTML = '<li class="empty">Пока нет записей</li>';
    return;
  }
  const first = ws[0].kg;
  $('#weights').innerHTML = ws.slice().reverse().map((w, i, arr) => {
    const prev = arr[i + 1];
    const d = prev ? w.kg - prev.kg : null;
    const delta = d === null || d === 0 ? '' : `<span class="delta ${d < 0 ? 'down' : 'up'}">${d > 0 ? '+' : ''}${d.toFixed(1)}</span>`;
    const date = new Date(w.date + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
    return `<li><span>${date}</span><span><b>${w.kg.toFixed(1)} кг</b>${delta}
      <button data-del="${w.date}" aria-label="Удалить">×</button></span></li>`;
  }).join('') + (ws.length > 1 ? `<li><span>Всего</span><b>${(ws[ws.length - 1].kg - first > 0 ? '+' : '') + (ws[ws.length - 1].kg - first).toFixed(1)} кг</b></li>` : '');
}

function render() {
  if (!plan) return;
  renderTodos();
  renderMeals();
  renderShop();
  renderWeights();
}

function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
  try { localStorage.setItem('tab', name); } catch {}
}

document.addEventListener('change', (e) => {
  if (e.target.matches('input[data-id]')) toggle(e.target.dataset.id, e.target.checked);
  if (e.target.matches('input[data-group]')) setGroup(e.target.dataset.group, e.target.checked);
  if (e.target.id === 'hide-bought') {
    hideBought = e.target.checked;
    try { localStorage.setItem('hideBought', hideBought ? '1' : ''); } catch {}
    renderShop();
  }
});

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return showTab(tab.dataset.tab);

  const exp = e.target.closest('[data-expand]');
  if (exp) {
    const id = exp.dataset.expand;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    return renderTodos();
  }

  const shift = e.target.closest('[data-shift]');
  if (shift) {
    todoOffset += Number(shift.dataset.shift);
    return renderTodos();
  }

  const cnt = e.target.closest('[data-count]');
  if (cnt) return bumpCounter(cnt.dataset.count, Number(cnt.dataset.step));

  const day = e.target.closest('[data-day]');
  if (day) {
    selectedDay = Number(day.dataset.day);
    return renderMeals();
  }

  const reset = e.target.closest('[data-reset]');
  if (reset) {
    const what = reset.dataset.reset === 'meals' ? 'все отметки рациона' : 'весь список покупок';
    if (!confirm(`Сбросить ${what}?`)) return;
    try {
      state = await api('/api/reset', { scope: reset.dataset.reset });
      render();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
    return;
  }

  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('Удалить запись?')) return;
    try {
      state = await api('/api/weight/delete', { date: del.dataset.del });
      renderWeights();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
  }
});

$('#weight-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    state = await api('/api/weight', { date: f.get('date'), kg: String(f.get('kg')).replace(',', '.') });
    e.target.kg.value = '';
    renderWeights();
  } catch (err) {
    toast('Ошибка: ' + err.message);
  }
});

async function refresh() {
  try {
    state = await api('/api/state');
    render();
  } catch {}
}

(async function init() {
  const d = new Date();
  $('#weight-form').date.value = ymd(d);
  try {
    hideBought = localStorage.getItem('hideBought') === '1';
    $('#hide-bought').checked = hideBought;
    const tab = localStorage.getItem('tab');
    if (tab) showTab(tab);
  } catch {}

  try {
    [plan, state] = await Promise.all([api('/api/plan'), api('/api/state')]);
  } catch (e) {
    toast('Не удалось загрузить: ' + e.message);
    return;
  }
  const { summary, rules } = plan;
  $('#summary').textContent = `Окно ${summary.window} · ~${summary.kcal} ккал · Б ${summary.macros.protein} / Ж ${summary.macros.fat} / У ${summary.macros.carbs}`;
  $('#rules').innerHTML = rules.map((r) => `<li>${esc(r)}</li>`).join('');
  // Сразу раскрыть дело, которое идёт сейчас
  const today = ymd(new Date());
  plan.routine.forEach((t) => taskStatus(t, taskProgress(today, t).done, today) === 'now' && expanded.add(t.id));
  render();

  // Синхронизация, если отмечали с другого устройства
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
  setInterval(refresh, 30000); // заодно обновляет «сейчас» и просроченные
})();
