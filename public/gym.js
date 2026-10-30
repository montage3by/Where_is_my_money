// ——— Тренировки: неделя, тренировка дня с подходами, прогресс по упражнениям и весу тела ———
// Данные — state.workouts[YYYY-MM-DD] = { day: 'mon', ex: { bench: [[кг, повторы], …] }, done: ISO }.
// У упражнений на время (планка) во втором числе подхода — секунды, вес пустой.

let gymDate = null; // открытая дата
let gymProgress = null; // выбранный график: id упражнения или 'body'
const gymOpen = new Set(); // раскрытые упражнения
const gymPick = {}; // дата → выбранная вручную тренировка (пока по ней ничего не записано)
const gymExtra = {}; // «дата:упражнение» → сколько подходов добавлено сверх плана

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const fmtNum = (n) => String(n).replace('.', ',');
const workouts = () => state.workouts || {};
const wDays = () => plan.workout.days;
const wDay = (id) => wDays().find((d) => d.id === id);
const exName = (e) => e.name || plan.exercises[e.id];
const isSec = (e) => e.unit === 'sec';
const shortDate = (date) => new Date(date + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');

// Какая тренировка в этот день: сохранённая, иначе по дню недели (сб и вс — отдых)
function dayFor(date) {
  if (gymPick[date]) return wDay(gymPick[date]);
  const w = workouts()[date];
  if (w && wDay(w.day)) return wDay(w.day);
  const dow = new Date(date + 'T00:00').getDay();
  return wDays().find((d) => d.dow === dow) || null;
}

function setsOf(date, exId) {
  const w = workouts()[date];
  return (w && w.ex && w.ex[exId]) || [];
}

// Лучший подход: больше вес, при равном — больше повторов (для планки — дольше)
function bestSet(sets, sec) {
  let best = null;
  for (const [kg, reps] of sets) {
    if (reps == null && kg == null) continue;
    const k = sec ? 0 : kg || 0;
    const r = reps || 0;
    if (!best || k > best[0] || (k === best[0] && r > best[1])) best = [k, r];
  }
  return best;
}
const setText = (s, sec) => (sec ? `${s[1]} сек` : s[0] ? `${fmtNum(s[0])} кг × ${s[1]}` : `${s[1]} повт.`);

// Прошлый раз, когда делалось это упражнение (в любой из дней программы)
function lastSession(exId, before) {
  const dates = Object.keys(workouts()).filter((d) => d < before && setsOf(d, exId).some(([a, b]) => a != null || b != null)).sort();
  const d = dates.pop();
  return d ? { date: d, sets: setsOf(d, exId) } : null;
}

const exDone = (e, sets) => sets.length >= e.sets && sets.slice(0, e.sets).every(([, r]) => r != null && r > 0);

function weekOf(date) {
  const d = new Date(date + 'T00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return [...Array(7)].map((_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return ymd(x);
  });
}

function renderGymWeek() {
  const today = ymd(new Date());
  const week = weekOf(gymDate);
  const done = week.filter((d) => workouts()[d] && workouts()[d].done).length;
  $('#gym-week').innerHTML = `
    <div class="gw-head">
      <button data-gym-week="-7" aria-label="Прошлая неделя">‹</button>
      <span class="kcal">${shortDate(week[0])} – ${shortDate(week[6])}</span>
      <span class="kcal">ИТОГИ ${done} из 5</span>
      <button data-gym-week="7" aria-label="Следующая неделя">›</button>
    </div>
    <div class="gw-days">${week.map((d) => {
      const day = dayFor(d);
      const w = workouts()[d];
      const cls = [d === gymDate && 'sel', d === today && 'today', w && w.done && 'done', !day && 'rest'].filter(Boolean).join(' ');
      return `<button class="gw-day ${cls}" data-gym-date="${d}" style="--wc:${day ? day.color : 'var(--muted)'}">
        <span class="kcal">${WD[new Date(d + 'T00:00').getDay()]}</span>
        <i>${w && w.done ? '✓' : Number(d.slice(8))}</i>
        <small>${day ? day.short : 'отдых'}</small>
      </button>`;
    }).join('')}</div>`;
}

const typingInGym = () => Boolean(document.activeElement && document.activeElement.matches('#gym-today input'));

function renderGymToday() {
  // Пока в поле вводят цифры, фоновое обновление не перерисовывает карточку
  if (typingInGym()) return;
  const day = dayFor(gymDate);
  const w = workouts()[gymDate];
  const today = ymd(new Date());
  const when = gymDate === today ? 'Сегодня' : new Date(gymDate + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const picker = `<div class="gt-pick">${wDays().map((d) => `<button data-gym-day="${d.id}" style="--wc:${d.color}" aria-pressed="${day && day.id === d.id}">${d.short}</button>`).join('')}</div>`;
  if (!day) {
    $('#gym-today').innerHTML = `<div class="gt-head"><span class="kcal">ЗАЛ · ${when.toUpperCase()}</span></div>
      <h2 class="gt-title">Отдых 😴</h2>
      <p class="kcal">По плану зал пн–пт. Если хочешь потренироваться сегодня — выбери тренировку:</p>${picker}`;
    return;
  }
  const doneN = day.ex.filter((e) => exDone(e, setsOf(gymDate, e.id))).length;
  $('#gym-today').style.setProperty('--wc', day.color);
  $('#gym-today').innerHTML = `
    <div class="gt-head"><span class="kcal">ЗАЛ · ${when.toUpperCase()}</span><span class="kcal">${doneN} / ${day.ex.length}</span></div>
    <h2 class="gt-title">${gymDate === today ? 'Сегодня — ' : ''}${esc(day.title)}</h2>
    <div class="kcal">${day.ex.length} упражнений · 45–60 мин${w && w.done ? ' · <b class="gt-ok">завершена ✓</b>' : ''}</div>
    ${picker}
    <div class="gx-list">${day.ex.map((e, i) => exHtml(e, i, day)).join('')}</div>
    <div class="gt-actions">
      <button class="link-btn" data-gym-img="${day.id}">Весь план дня — картинка</button>
      ${w && w.done
        ? '<button class="gt-finish undo" data-gym-done="0">Тренировка завершена ✓ · отменить</button>'
        : '<button class="gt-finish" data-gym-done="1">Завершить тренировку</button>'}
    </div>`;
}

function exHtml(e, i, day) {
  const sec = isSec(e);
  const sets = setsOf(gymDate, e.id);
  const last = lastSession(e.id, gymDate);
  const lastBest = last && bestSet(last.sets, sec);
  const best = bestSet(sets, sec);
  const open = gymOpen.has(e.id);
  const rows = Math.max(e.sets, sets.length) + (gymExtra[`${gymDate}:${e.id}`] || 0);
  return `<div class="gx${exDone(e, sets) ? ' done' : ''}${open ? ' open' : ''}">
    <button class="gx-head" data-gx="${e.id}">
      <span class="gx-n">${exDone(e, sets) ? '✓' : i + 1}</span>
      <span class="gx-main"><b>${esc(exName(e))}</b>
        <span class="kcal">${e.sets}×${esc(e.reps)}${lastBest ? ` · прошлый раз ${setText(lastBest, sec)}` : ''}</span></span>
      <span class="gx-best">${best ? setText(best, sec) : ''}</span>
    </button>
    ${open ? `<div class="gx-body">
      <img class="gx-img" src="img/workout/${day.id}-${i + 1}.jpg" data-gym-img-src="img/workout/${day.id}-${i + 1}.jpg" alt="Техника: ${esc(exName(e))}" loading="lazy">
      <p class="gx-tip">🎯 ${esc(e.tip)}</p>
      ${[...Array(rows)].map((_, k) => {
        const [kg, reps] = sets[k] || [];
        const [pkg, preps] = (last && last.sets[k]) || [];
        return `<div class="gx-set"><span class="kcal">Подход ${k + 1}</span>
          ${sec ? '' : `<input inputmode="decimal" data-gs="${e.id}" data-k="${k}" data-f="0" value="${kg == null ? '' : fmtNum(kg)}" placeholder="${pkg == null ? '–' : fmtNum(pkg)}" aria-label="Вес, кг"><span class="kcal">кг ×</span>`}
          <input inputmode="numeric" data-gs="${e.id}" data-k="${k}" data-f="1" value="${reps ?? ''}" placeholder="${preps ?? '–'}" aria-label="${sec ? 'Секунды' : 'Повторы'}">
          <span class="kcal">${sec ? 'сек' : 'повт'}</span></div>`;
      }).join('')}
      <button class="link-btn gx-add" data-gs-add="${e.id}">+ подход</button>
    </div>` : ''}
  </div>`;
}

// ——— Прогресс ———
function progressSeries(id) {
  if (id === 'body') return (state.weights || []).map((w) => ({ date: w.date, v: w.kg, text: `${fmtNum(w.kg)} кг` }));
  const sec = id === 'plank';
  return Object.keys(workouts()).sort().map((d) => {
    const b = bestSet(setsOf(d, id), sec);
    return b && (sec ? b[1] : b[0] || b[1]) ? { date: d, v: sec || !b[0] ? b[1] : b[0], text: setText(b, sec) } : null;
  }).filter(Boolean);
}

function lineChart(pts) {
  const W = 320, H = 150, L = 40, R = 12, T = 12, B = 26;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = [hi, (hi + lo) / 2, lo];
  const last = pts.length - 1;
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmtNum(Math.round(t * 10) / 10)}</text>`).join('')}
    <polyline points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === last ? 5 : 3.5}" class="${i === last ? 'last' : ''}"/>`).join('')}
    <text x="${L}" y="${H - 6}" class="d">${shortDate(pts[0].date)}</text>
    ${pts.length > 1 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end" class="d">${shortDate(pts[last].date)}</text>` : ''}
  </svg>`;
}

function renderGymProgress() {
  const logged = Object.keys(plan.exercises).filter((id) => progressSeries(id).length);
  if (!gymProgress || (gymProgress !== 'body' && !logged.includes(gymProgress))) gymProgress = logged[0] || 'body';
  $('#gym-chips').innerHTML = [...logged.map((id) => [id, plan.exercises[id]]), ['body', 'Вес тела']]
    .map(([id, n]) => `<button data-gym-prog="${id}" aria-pressed="${id === gymProgress}">${esc(n)}</button>`).join('');
  const pts = progressSeries(gymProgress);
  const isBody = gymProgress === 'body';
  $('#gym-body').hidden = !isBody;
  if (!pts.length) {
    $('#gym-progress').innerHTML = `<p class="empty">${isBody ? 'Запиши вес ниже — появится график.' : 'Запиши подходы в тренировке — здесь появится график рабочего веса.'}</p>`;
    return;
  }
  const lastP = pts[pts.length - 1];
  const diff = Math.round((lastP.v - pts[0].v) * 10) / 10;
  const unit = gymProgress === 'plank' ? 'сек' : 'кг';
  $('#gym-progress').innerHTML = `
    <span class="kcal gp-label">${esc(isBody ? 'ВЕС ТЕЛА' : plan.exercises[gymProgress].toUpperCase())}</span>
    <div class="gp-big"><b>${fmtNum(lastP.v)}</b><span>${unit}</span></div>
    <div class="kcal">${isBody ? 'Последнее взвешивание' : gymProgress === 'plank' ? 'Лучший подход' : 'Рабочий вес'} · ${shortDate(lastP.date)} · ${lastP.text}
      ${pts.length > 1 && diff ? ` · <b class="${diff > 0 === !isBody ? 'gp-up' : 'gp-down'}">${diff > 0 ? '+' : ''}${fmtNum(diff)} ${unit}</b> с ${shortDate(pts[0].date)}` : ''}</div>
    ${lineChart(pts)}`;
}

function renderGymProgram() {
  $('#gym-program').innerHTML = wDays().map((d) => `
    <details class="card gp-day" style="--wc:${d.color}">
      <summary><span class="gp-dot"></span><b>${WD[d.dow]} · ${esc(d.title)}</b><span class="kcal">${d.ex.length} упр.</span></summary>
      <ol>${d.ex.map((e, i) => `<li><span>${esc(exName(e))}</span><b>${e.sets}×${esc(e.reps)}</b><small class="kcal">${esc(e.tip)}</small>
        <img class="gx-img" src="img/workout/${d.id}-${i + 1}.jpg" data-gym-img-src="img/workout/${d.id}-${i + 1}.jpg" alt="" loading="lazy"></li>`).join('')}</ol>
      <button class="link-btn" data-gym-img="${d.id}">Техника — картинка</button>
    </details>`).join('') + `<ul class="card rules">${plan.workout.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
}

function renderGym() {
  if (!plan || !plan.workout || !$('#tab-gym')) return;
  if (!gymDate) gymDate = ymd(new Date());
  renderGymWeek();
  renderGymToday();
  renderGymProgress();
  if (!$('#gym-program').innerHTML) renderGymProgram();
}

// ——— Запись ———
async function saveSets(exId) {
  const day = dayFor(gymDate);
  const inputs = [...document.querySelectorAll(`[data-gs="${exId}"]`)];
  const rows = [];
  for (const inp of inputs) {
    const k = Number(inp.dataset.k);
    rows[k] = rows[k] || [null, null];
    const v = inp.value.trim().replace(',', '.');
    rows[k][Number(inp.dataset.f)] = v === '' ? null : Number(v);
  }
  while (rows.length && rows[rows.length - 1].every((v) => v == null)) rows.pop();
  try {
    await write('/api/workout', { date: gymDate, day: day.id, ex: exId, sets: rows });
  } catch (e) {
    toast('Не сохранилось: ' + e.message);
  }
}

// Завершённая тренировка закрывает дело «Спортзал» в «Делах» этого дня
async function checkGymTask(date, done) {
  if (date > ymd(new Date())) return;
  const t = visibleTasks(date).find((x) => /спортзал|^зал/i.test(x.title) && !x.subtasks && !x.counter);
  if (!t) return;
  const id = `todo:${date}:${t.id}`;
  if (Boolean(state.checks[id]) !== done) await write('/api/check', { ids: [id], done });
}

document.addEventListener('change', (e) => {
  const inp = e.target.closest('[data-gs]');
  if (inp) saveSets(inp.dataset.gs).then(() => { if (!typingInGym()) render(); });
});

document.addEventListener('click', async (e) => {
  const t = e.target;
  const date = t.closest('[data-gym-date]');
  if (date) { gymDate = date.dataset.gymDate; gymOpen.clear(); return renderGym(); }
  const wk = t.closest('[data-gym-week]');
  if (wk) {
    const d = new Date(gymDate + 'T00:00');
    d.setDate(d.getDate() + Number(wk.dataset.gymWeek));
    gymDate = ymd(d);
    return renderGym();
  }
  const gx = t.closest('[data-gx]');
  if (gx) {
    const id = gx.dataset.gx;
    if (gymOpen.has(id)) gymOpen.delete(id);
    else gymOpen.add(id);
    return renderGymToday();
  }
  const add = t.closest('[data-gs-add]');
  if (add) {
    const key = `${gymDate}:${add.dataset.gsAdd}`;
    gymExtra[key] = (gymExtra[key] || 0) + 1;
    return renderGymToday();
  }
  const pick = t.closest('[data-gym-day]');
  if (pick) {
    const cur = dayFor(gymDate);
    if (cur && cur.id === pick.dataset.gymDay) return;
    const w = workouts()[gymDate];
    if (w && (Object.keys(w.ex || {}).length || w.done) && !confirm('Записи этого дня заменятся другой тренировкой. Продолжить?')) return;
    gymPick[gymDate] = pick.dataset.gymDay;
    gymOpen.clear();
    return renderGym();
  }
  const done = t.closest('[data-gym-done]');
  if (done) {
    const on = done.dataset.gymDone === '1';
    try {
      await write('/api/workout', { date: gymDate, day: dayFor(gymDate).id, done: on });
      await checkGymTask(gymDate, on);
      if (on) toast('Тренировка записана 💪');
    } catch (err) {
      toast('Не сохранилось: ' + err.message);
    }
    return render();
  }
  const prog = t.closest('[data-gym-prog]');
  if (prog) { gymProgress = prog.dataset.gymProg; return renderGymProgress(); }
  const img = t.closest('[data-gym-img], [data-gym-img-src]');
  if (img && !t.closest('#img-dialog')) {
    $('#img-dialog img').src = img.dataset.gymImgSrc || `img/workout/${img.dataset.gymImg}.jpg`;
    return $('#img-dialog').showModal();
  }
  if (t.closest('#img-dialog')) $('#img-dialog').close();
});

// Enter в поле — к следующему полю
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('[data-gs]')) return;
  e.preventDefault();
  const all = [...document.querySelectorAll('#gym-today [data-gs]')];
  const next = all[all.indexOf(e.target) + 1];
  if (next) next.focus();
  else e.target.blur();
});
