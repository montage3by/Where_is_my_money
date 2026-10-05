const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => n.toFixed(2).replace(/\.00$/, '') + ' ₾';

let plan;
let state = { checks: {}, weights: [], counters: {}, snapshots: {} };
const todayIdx = (new Date().getDay() + 6) % 7; // Пн = 0
let selectedDay = todayIdx;
let hideBought = false;
let viewDate = null; // YYYY-MM-DD открытого дня во вкладке «Дела»
let followDefault = true; // пользователь не листал — после полуночи переезжаем на новый день
const expanded = new Set();

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function daysFromToday(date) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + 'T00:00') - midnight) / 86400000);
}
function todoDay() {
  return new Date(viewDate + 'T00:00');
}
// Сегодня, а до старта трекера — его первый день
function defaultDate() {
  const today = ymd(new Date());
  return today < plan.start ? plan.start : today;
}
function openDate(date) {
  viewDate = date < plan.start ? plan.start : date;
  followDefault = viewDate === defaultDate();
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

// Запись на сервер. Ответы могут прийти не по порядку: применяем только ответ на последнюю
// запись — в нём уже есть все предыдущие. Иначе быстрые отметки подряд «слетали».
let writeSeq = 0;
let pendingWrites = 0;
async function write(path, body) {
  const my = ++writeSeq;
  pendingWrites++;
  try {
    const fresh = await api(path, body);
    if (my === writeSeq) state = fresh;
    return fresh;
  } finally {
    pendingWrites--;
  }
}

async function toggle(id, done) {
  const prev = state.checks[id];
  if (done) state.checks[id] = new Date().toISOString();
  else delete state.checks[id];
  render();
  try {
    await write('/api/check', { id, done });
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
// Разовые дела хранятся без даты: todo:once:<id>
const taskKey = (date, t) => `todo:${t.once ? 'once' : date}:${t.id}`;
const subIds = (date, t) => t.subtasks.map((_, i) => `${taskKey(date, t)}:${i}`);

// Разовое дело видно каждый день, пока не сделано, а после — только в день выполнения
function doneOn(date, t) {
  const ids = t.subtasks ? subIds(date, t) : [taskKey(date, t)];
  if (!ids.every(isDone)) return null;
  return ymd(new Date(ids.map((id) => state.checks[id]).sort().pop()));
}
// Список дел редактируется на сайте и приходит с сервера в state.routine
const routine = () => state.routine || plan.routine;

// Прошлые дни — по сохранённому на тот день списку, сегодня и дальше — по актуальному
function tasksFor(date) {
  const snap = state.snapshots && state.snapshots[date];
  if (!snap || date >= ymd(new Date())) return routine();
  return [...snap, ...routine().filter((t) => t.once)];
}

// По времени: сначала с временем начала/окончания, без времени — в конце в порядке добавления
const sortKey = (t) => t.start || t.end || '99:99';
const visibleTasks = (date) => tasksFor(date).filter((t) => {
  if (t.date) return t.date === date;
  if (t.from && date < t.from) return false;
  if (t.days && !t.days.includes(new Date(date + 'T00:00').getDay())) return false;
  if (!t.once) return true;
  const d = doneOn(date, t);
  return !d || date <= d;
}).map((t, i) => [t, i]).sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])) || a[1] - b[1]).map(([t]) => t);
const count = (date, t) => state.counters[`${t.id}:${date}`] || 0;

function taskProgress(date, t) {
  if (t.counter) return { done: count(date, t) >= t.counter.target, n: count(date, t), of: t.counter.target };
  if (t.subtasks) {
    const n = subIds(date, t).filter(isDone).length;
    return { done: n === t.subtasks.length, n, of: t.subtasks.length };
  }
  return { done: isDone(taskKey(date, t)) };
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
  const { target, steps, unit } = t.counter;
  const u = unit ? ` ${esc(unit)}` : '';
  return `<div class="counter">
    <div class="counter-top"><span class="big">${n}${u}</span><span class="kcal">из ${target}${u}</span></div>
    <div class="bar"><span style="width:${Math.min(100, (n / target) * 100)}%"></span></div>
    <div class="counter-btns">
      <button data-count="${t.id}" data-step="-${steps[0]}">−${steps[0]}</button>
      ${steps.map((st) => `<button data-count="${t.id}" data-step="${st}" class="plus">+${st}</button>`).join('')}
    </div>
  </div>`;
}

function mealHtml(day, idx) {
  const m = plan.days[(day.getDay() + 6) % 7].meals[idx];
  return m ? `<p class="menu"><span class="kcal">${esc(m.type)} · ~${m.kcal} ккал</span>${esc(m.dish)}</p>` : '';
}

function renderTodos() {
  const day = todoDay();
  const date = ymd(day);
  const label = day.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const rel = { 0: 'сегодня', '-1': 'вчера', 1: 'завтра' }[daysFromToday(date)];
  $('#todo-date').textContent = label + (rel ? ` · ${rel}` : '');
  $('[data-shift="-1"]').disabled = date <= plan.start;

  const tasks = visibleTasks(date);
  const progress = tasks.map((t) => taskProgress(date, t));
  const dayN = daysFromToday(date) - daysFromToday(plan.start) + 1;
  $('#todo-progress').textContent = `День ${dayN} · сделано ${progress.filter((p) => p.done).length} из ${tasks.length}`;

  $('#todo-list').innerHTML = tasks.map((t, i) => {
    const p = progress[i];
    const status = taskStatus(t, p.done, date);
    const expandable = true; // внутри всегда есть хотя бы кнопка «Изменить»
    const editable = routine().some((x) => x.id === t.id);
    const open = expandable && expanded.has(t.id);
    const time = t.start && t.end ? `${t.start}–${t.end}` : t.start ? `в ${t.start}` : t.end ? `до ${t.end}` : '';

    let check;
    if (t.counter) check = `<span class="ring${p.done ? ' full' : ''}" style="--p:${Math.min(1, p.n / p.of)}"></span>`;
    else if (t.subtasks) check = `<input type="checkbox" class="cb" data-group="${t.id}"${p.done ? ' checked' : ''} aria-label="Отметить всё">`;
    else check = `<input type="checkbox" class="cb" data-id="${taskKey(date, t)}"${p.done ? ' checked' : ''}>`;

    const badge = (status === 'now' ? '<span class="badge">сейчас</span>' : '') + (t.once ? '<span class="badge soft">разово</span>' : '')
      + (t.days ? `<span class="badge soft">${daysLabel(t.days)}</span>` : '');
    const countLabel = p.of ? `<span class="kcal">${p.n}/${p.of}${t.counter?.unit ? ' ' + esc(t.counter.unit) : ''}</span>` : '';

    let body = '';
    if (open) {
      body = `<div class="todo-body">
        ${t.meal !== undefined ? mealHtml(day, t.meal) : ''}
        ${t.details ? `<p class="details">${esc(t.details)}</p>` : ''}
        ${t.subtasks ? t.subtasks.map((st, si) => taskHtml({ id: `${taskKey(date, t)}:${si}`, title: st })).join('') : ''}
        ${t.counter ? counterHtml(date, t) : ''}
        ${editable ? `<button class="edit-btn" data-edit="${t.id}">✎ Изменить</button>` : ''}
      </div>`;
    }

    return `<div class="todo card ${p.done ? 'done' : ''} ${status}">
      <div class="todo-row">
        ${check}
        <button class="todo-main" ${expandable ? `data-expand="${t.id}" aria-expanded="${open}"` : 'tabindex="-1"'}>
          <span class="body">
            ${time || badge ? `<span class="meta">${time ? `<b>${time}</b>` : ''}${badge}</span>` : ''}
            <span class="title">${esc(t.title)}</span>
          </span>
          ${countLabel}
          ${expandable ? `<span class="chev">${open ? '▴' : '▾'}</span>` : ''}
        </button>
      </div>
      ${body}
    </div>`;
  }).join('') + `<button class="add-btn" data-add>+ Добавить дело</button>`;
}

// ——— Редактор дел ———
const dlg = () => $('#task-dialog');
const form = () => $('#task-form');
let editingId = null;

// Дни недели в порядке Пн…Вс; значения — как Date.getDay()
const WEEK = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];

// [0,1,2,3,4] → «Пн–Чт, Вс»
function daysLabel(days) {
  const parts = [];
  let run = [];
  for (const [d, name] of [...WEEK, [null, null]]) {
    if (d !== null && days.includes(d)) run.push(name);
    else if (run.length) {
      parts.push(run.length > 2 ? `${run[0]}–${run.at(-1)}` : run.join(', '));
      run = [];
    }
  }
  return parts.join(', ');
}

function syncFormVisibility() {
  const f = form();
  const kind = f.kind.value;
  const when = f.when.value;
  f.querySelectorAll('[data-kind]').forEach((el) => (el.hidden = el.dataset.kind !== kind));
  const dateRow = f.querySelector('[data-when-date]');
  f.querySelector('[data-when-days]').hidden = when !== 'daily';
  dateRow.querySelector('span').textContent = when === 'date' ? 'Дата' : when === 'once' ? 'Начать с' : 'Начиная с (можно оставить пустым)';
}

function openEditor(task) {
  const f = form();
  f.reset();
  showFormError('');
  editingId = task ? task.id : null;
  $('#task-dialog-title').textContent = task ? 'Изменить дело' : 'Новое дело';
  f.querySelector('[data-delete-task]').hidden = !task;
  const t = task || {};
  f.title.value = t.title || '';
  f.start.value = t.start || '';
  f.end.value = t.end || '';
  f.details.value = t.details || '';
  f.kind.value = t.subtasks ? 'subtasks' : t.counter ? 'counter' : 'simple';
  f.subtasks.value = (t.subtasks || []).join('\n');
  f.target.value = t.counter ? t.counter.target : '';
  f.when.value = !task ? 'date' : t.date ? 'date' : t.once ? 'once' : 'daily';
  f.date.value = t.date || t.from || (task && !t.once ? '' : viewDate);
  f.querySelectorAll('[name=days]').forEach((cb) => (cb.checked = !t.days || t.days.includes(Number(cb.value))));
  syncFormVisibility();
  dlg().showModal();
  if (!task) f.title.focus();
}

function showFormError(msg) {
  const el = $('#task-error');
  el.textContent = msg;
  el.hidden = !msg;
}

async function saveTask(e) {
  e.preventDefault();
  const f = form();
  const body = {
    id: editingId || undefined,
    title: f.title.value,
    start: f.start.value,
    end: f.end.value,
    details: f.details.value,
    kind: f.kind.value,
    subtasks: f.subtasks.value.split('\n'),
    target: f.target.value,
    when: f.when.value,
    date: f.date.value,
    days: [...f.querySelectorAll('[name=days]:checked')].map((cb) => Number(cb.value)),
  };
  try {
    await write('/api/task', body);
    dlg().close();
    render();
  } catch (err) {
    showFormError(err.message);
  }
}

async function deleteTask() {
  if (!editingId || !confirm('Удалить это дело? Прошлые дни с отметками останутся в истории.')) return;
  try {
    await write('/api/task/delete', { id: editingId });
    expanded.delete(editingId);
    dlg().close();
    render();
  } catch (err) {
    showFormError(err.message);
  }
}

// Все даты, за которые что-то отмечено, — от новых к старым
function historyDates() {
  const dates = new Set();
  for (const id of Object.keys(state.checks)) {
    const m = /^todo:(\d{4}-\d{2}-\d{2}):/.exec(id);
    if (m) dates.add(m[1]);
  }
  for (const key of Object.keys(state.counters)) dates.add(key.split(':')[1]);
  for (const id of Object.keys(state.checks)) if (id.startsWith('todo:once:')) dates.add(ymd(new Date(state.checks[id])));
  const today = ymd(new Date());
  return [...dates].filter((d) => d <= today && d >= plan.start).sort().reverse();
}

function renderHistory() {
  const dates = historyDates();
  if (!dates.length) {
    $('#todo-history').innerHTML = '<p class="empty">Пока пусто — отмеченные дни появятся здесь.</p>';
    return;
  }
  const current = ymd(todoDay());
  $('#todo-history').innerHTML = dates.map((date) => {
    const tasks = visibleTasks(date);
    const done = tasks.filter((t) => taskProgress(date, t).done).length;
    const label = new Date(date + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    return `<button class="hist-row${date === current ? ' active' : ''}" data-goto="${date}">
      <span>${label}</span>
      <span class="bar"><span style="width:${(done / tasks.length) * 100}%"></span></span>
      <span class="kcal">${done}/${tasks.length}</span>
    </button>`;
  }).join('');
}

async function setGroup(taskId, done) {
  const date = ymd(todoDay());
  const t = tasksFor(date).find((x) => x.id === taskId);
  const ids = subIds(date, t);
  const prev = Object.fromEntries(ids.map((id) => [id, state.checks[id]]));
  ids.forEach((id) => (done ? (state.checks[id] = state.checks[id] || new Date().toISOString()) : delete state.checks[id]));
  render();
  try {
    await write('/api/check', { ids, done });
  } catch (e) {
    ids.forEach((id) => (prev[id] ? (state.checks[id] = prev[id]) : delete state.checks[id]));
    toast('Не сохранилось: ' + e.message);
  }
  render();
}

let counterSeq = 0;
async function bumpCounter(taskId, step) {
  const date = ymd(todoDay());
  const t = tasksFor(date).find((x) => x.id === taskId);
  const key = `${taskId}:${date}`;
  const value = Math.max(0, count(date, t) + step);
  if (value) state.counters[key] = value;
  else delete state.counters[key];
  renderTodos();
  const seq = ++counterSeq;
  try {
    await write('/api/counter', { id: taskId, date, value });
  } catch (e) {
    toast('Не сохранилось: ' + e.message);
    if (seq === counterSeq) refresh();
  }
}

// ——— Дневник питания: сегодня, что съедено на самом деле ———
function renderFood() {
  const today = ymd(new Date());
  const list = (state.food && state.food[today]) || [];
  const total = list.reduce((sum, x) => sum + (x.kcal || 0), 0);
  $('#food-total').textContent = list.length ? `~${total} ккал из ~${plan.summary.kcal}` : '';
  $('#food-list').innerHTML = list.length
    ? list.map((x) => `<div class="food-item">
        <div><span class="kcal">${esc(x.meal)}</span><div>${esc(x.text)}</div></div>
        <span class="kcal">${x.kcal != null ? '~' + x.kcal : ''}</span>
        <button data-food-del="${x.id}" aria-label="Удалить">×</button>
      </div>`).join('')
    : '<p class="empty">Сегодня пока ничего не записано</p>';
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
  renderHistory();
  renderMeals();
  renderFood();
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

  if (e.target.closest('[data-add]')) return openEditor(null);
  if (e.target.closest('[data-city]')) return openCity();
  const pick = e.target.closest('[data-pick]');
  if (pick) return pickCity(Number(pick.dataset.pick));
  if (e.target.closest('[data-city-close]')) return $('#city-dialog').close();
  const ed = e.target.closest('[data-edit]');
  if (ed) return openEditor(routine().find((t) => t.id === ed.dataset.edit));
  if (e.target.closest('[data-close]')) return dlg().close();
  if (e.target.closest('[data-delete-task]')) return deleteTask();

  const exp = e.target.closest('[data-expand]');
  if (exp) {
    const id = exp.dataset.expand;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    return renderTodos();
  }

  const shift = e.target.closest('[data-shift]');
  if (shift) {
    const d = todoDay();
    d.setDate(d.getDate() + Number(shift.dataset.shift));
    openDate(ymd(d));
    renderTodos();
    return renderHistory();
  }

  const go = e.target.closest('[data-goto]');
  if (go) {
    openDate(go.dataset.goto);
    render();
    return window.scrollTo({ top: 0, behavior: 'smooth' });
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
      await write('/api/reset', { scope: reset.dataset.reset });
      render();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
    return;
  }

  const fdel = e.target.closest('[data-food-del]');
  if (fdel) {
    if (!confirm('Удалить запись?')) return;
    try {
      await write('/api/food/delete', { date: ymd(new Date()), id: fdel.dataset.foodDel });
      renderFood();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
    return;
  }

  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('Удалить запись?')) return;
    try {
      await write('/api/weight/delete', { date: del.dataset.del });
      renderWeights();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
  }
});

$('#task-form').addEventListener('submit', saveTask);
$('#food-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await write('/api/food', { date: ymd(new Date()), meal: f.meal.value, text: f.text.value, kcal: f.kcal.value });
    f.text.value = '';
    f.kcal.value = '';
    renderFood();
  } catch (err) {
    toast('Ошибка: ' + err.message);
  }
});
$('#city-q').addEventListener('input', () => {
  clearTimeout(citySearchT);
  citySearchT = setTimeout(searchCities, 350);
});
$('#city-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (searchCities.list?.length) pickCity(0);
});
$('#city-dialog').addEventListener('click', (e) => e.target === $('#city-dialog') && $('#city-dialog').close());
$('#task-form').addEventListener('change', (e) => e.target.matches('[name=kind],[name=when]') && syncFormVisibility());
// Клик по затемнению вокруг окна закрывает его
$('#task-dialog').addEventListener('click', (e) => e.target === dlg() && dlg().close());

$('#weight-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await write('/api/weight', { date: f.get('date'), kg: String(f.get('kg')).replace(',', '.') });
    e.target.kg.value = '';
    renderWeights();
  } catch (err) {
    toast('Ошибка: ' + err.message);
  }
});

// ——— Город для погоды ———
let citySearchT;
function openCity() {
  $('#city-q').value = '';
  $('#city-results').innerHTML = '';
  $('#city-error').hidden = true;
  $('#city-dialog').showModal();
  $('#city-q').focus();
}

async function searchCities() {
  const q = $('#city-q').value.trim();
  if (q.length < 2) return ($('#city-results').innerHTML = '');
  try {
    const list = await api('/api/geo?q=' + encodeURIComponent(q));
    if ($('#city-q').value.trim() !== q) return; // пока ждали, ввели другое
    $('#city-error').hidden = true;
    $('#city-results').innerHTML = list.length
      ? list.map((c, i) => `<button type="button" class="city-opt" data-pick="${i}"><b>${esc(c.name)}</b><span class="kcal">${esc([c.region, c.country].filter(Boolean).join(', '))}</span></button>`).join('')
      : '<p class="kcal">Ничего не нашлось</p>';
    searchCities.list = list;
  } catch (err) {
    $('#city-error').textContent = err.message;
    $('#city-error').hidden = false;
  }
}

async function pickCity(i) {
  const c = searchCities.list[i];
  try {
    await write('/api/settings/city', c);
    $('#city-dialog').close();
    $('#info').innerHTML = '<p class="kcal">Загружаю погоду…</p>';
    loadInfo();
  } catch (err) {
    $('#city-error').textContent = err.message;
    $('#city-error').hidden = false;
  }
}

// ——— Погода и курсы ———
async function loadInfo() {
  let data;
  try {
    data = await api('/api/info');
  } catch {
    return;
  }
  const { weather: w, fx } = data;
  if (!w && !fx) return;
  const fmtDay = (d, i) => (i === 0 ? 'Сегодня' : 'Завтра');
  const num = (v, digits) => v.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  $('#info').innerHTML = `
    ${w ? `<div class="weather">
      <div class="now"><span class="w-icon">${w.icon}</span><span class="w-temp">${w.temp > 0 ? '+' : ''}${w.temp}°</span>
        <span class="w-desc"><button class="city-btn" data-city>📍 ${esc(w.city)}</button> · ${esc(w.text)}<br><span class="kcal">ощущается ${w.feels}°, ветер ${w.wind} м/с</span></span></div>
      <div class="w-days">${w.days.map((d, i) => `<span>${fmtDay(d.date, i)} ${d.icon} ${d.max}° / ${d.min}°${d.rain >= 30 ? ` · ☔ ${d.rain}%` : ''}</span>`).join('')}</div>
    </div>` : ''}
    ${fx ? `<div class="fx">${fx.rates.map((r) => `<div><span class="kcal">${esc(r.label)}</span><b>${num(r.value, r.to === 'GEL' ? 3 : 2)}</b></div>`).join('')}</div>` : ''}`;
  $('#info').hidden = false;
}

async function refresh() {
  try {
    const at = writeSeq;
    const fresh = await api('/api/state');
    // Пока идёт запись (или она прошла, пока мы ждали), фоновое обновление устарело — не затираем отметки
    if (pendingWrites || at !== writeSeq) return;
    state = fresh;
    if (followDefault) viewDate = defaultDate();
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
  openDate(defaultDate());
  selectedDay = (todoDay().getDay() + 6) % 7; // рацион — на тот же день недели
  // Сразу раскрыть дело, которое идёт сейчас
  const today = ymd(new Date());
  routine().forEach((t) => taskStatus(t, taskProgress(today, t).done, today) === 'now' && expanded.add(t.id));
  render();

  // Синхронизация, если отмечали с другого устройства
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
  setInterval(refresh, 30000); // заодно обновляет «сейчас» и просроченные
  loadInfo();
  setInterval(loadInfo, 30 * 60 * 1000);
})();
