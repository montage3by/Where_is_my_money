// ——— Игра: опыт, уровни, серии, характеристики, сезоны, достижения ———
// Ничего не хранится отдельно: всё считается из отметок и счётчиков (state.checks/counters),
// поэтому восстановление данных из копии восстанавливает и прогресс.

const STATS = {
  str: { name: 'Сила', short: 'СИЛ', icon: '💪' },
  wis: { name: 'Мудрость', short: 'МУД', icon: '📖' },
  dis: { name: 'Дисциплина', short: 'ДИС', icon: '🛡️' },
  foc: { name: 'Фокус', short: 'ФОК', icon: '🎯' },
  con: { name: 'Уверенность', short: 'УВЕ', icon: '🔥' },
};
const STAT_KEYS = Object.keys(STATS);

// Характеристика по названию дела, если в деле не выбрана явно
const STAT_RULES = [
  ['str', /зал|спорт|трен|зарядк|бег|пробеж|отжим|присед|абонемент|растяж/i],
  ['wis', /пдд|билет|выуч|учить|книг|чита|урок|курс|язык|регулировщ/i],
  ['con', /позвон|созвон|встреч|бабушк|мам|артур|друз|свидан/i],
  ['foc', /работ|hh|отклик|проект|резюме|плит|оплат|коммунал|деньги|дел[аио]? /i],
];
const statOf = (text) => (STAT_RULES.find(([, re]) => re.test(text)) || ['dis'])[0];

const gameStart = () => (plan.game && plan.game.start) || plan.start;
const gameEnd = () => (plan.game && plan.game.end) || '2026-12-31';
const addDays = (date, n) => {
  const d = new Date(date + 'T00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const gameDayN = (date) => Math.round((new Date(date + 'T00:00') - new Date(gameStart() + 'T00:00')) / 86400000) + 1;
const gameLength = () => gameDayN(gameEnd());

// Единицы опыта дела: подпункты дают XP по отдельности, остальное — целиком.
// xp: 0 в деле — дело вне игры.
function units(t) {
  if (t.xp === 0) return [];
  const base = t.stat || statOf(t.title);
  if (t.subtasks) {
    const each = t.xp ? Math.max(1, Math.round(t.xp / t.subtasks.length)) : 10;
    return t.subtasks.map((st) => ({ stat: t.stat || (statOf(st) !== 'dis' ? statOf(st) : base), xp: each }));
  }
  return [{ stat: base, xp: t.xp || (t.counter && !t.counter.limit ? 30 : 20) }];
}

// Насколько выполнена каждая единица (0…1)
function unitFractions(date, t) {
  if (t.subtasks) return subIds(date, t).map((id) => (isDone(id) ? 1 : 0));
  if (isLimit(t)) return [count(date, t) <= t.counter.target ? 1 : 0];
  if (t.counter) return [Math.min(1, count(date, t) / t.counter.target)];
  return [isDone(taskKey(date, t)) ? 1 : 0];
}

// Итог дня: сколько получено и (для прошедших дней) сколько списано за невыполненное
function dayCalc(date) {
  const today = ymd(new Date());
  const past = date < today;
  const res = { date, gain: 0, loss: 0, max: 0, byStat: {}, items: [] };
  for (const t of visibleTasks(date)) {
    const us = units(t);
    if (!us.length) continue;
    const fs = unitFractions(date, t);
    // Разовые «пока не сделаю» не штрафуются каждый день — только дают опыт, когда сделаны
    const penalize = past && !t.once;
    let gain = 0;
    let loss = 0;
    us.forEach((u, i) => {
      const g = Math.round(u.xp * fs[i]);
      gain += g;
      res.byStat[u.stat] = (res.byStat[u.stat] || 0) + g;
      if (penalize) loss += u.xp - g;
    });
    const max = us.reduce((a, u) => a + u.xp, 0);
    res.gain += gain;
    res.loss += loss;
    res.max += max;
    res.items.push({ t, gain, loss, max, full: fs.every((f) => f >= 1) });
  }
  res.net = res.gain - res.loss;
  res.ratio = res.max ? res.gain / res.max : 0;
  return res;
}

// Уровень: чтобы дойти до уровня L, нужно 20·L·(L−1) XP
const xpForLevel = (L) => 20 * L * (L - 1);
function levelOf(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  return { level: L, from: xpForLevel(L), to: xpForLevel(L + 1) };
}

// Ранги сезона (сезон = календарный месяц)
const TIERS = [['Бронза', 0], ['Серебро', 600], ['Золото', 1500], ['Платина', 2800], ['Алмаз', 4200], ['Легенда', 6000]];
const ROMAN = ['IV', 'III', 'II', 'I'];
function rankOf(xp) {
  let i = 0;
  while (i + 1 < TIERS.length && xp >= TIERS[i + 1][1]) i++;
  const [name, lo] = TIERS[i];
  const hi = TIERS[i + 1] ? TIERS[i + 1][1] : lo + 2000;
  const step = (hi - lo) / 4;
  const div = Math.min(3, Math.floor((Math.max(0, xp) - lo) / step));
  const next = div < 3 ? `${name} ${ROMAN[div + 1]}` : TIERS[i + 1] ? `${TIERS[i + 1][0]} IV` : null;
  return { name: `${name} ${ROMAN[Math.max(0, div)]}`, tier: name.toLowerCase(), toNext: next ? Math.ceil(lo + step * (Math.max(0, div) + 1) - xp) : 0, next,
    pct: Math.max(0, Math.min(1, (xp - lo - step * Math.max(0, div)) / step)) };
}

// Серия дела: подряд дни (по которым дело было в списке), когда оно выполнено целиком
function taskStreak(t, today) {
  if (t.once || t.date) return 0;
  let n = 0;
  for (let d = today; d >= gameStart(); d = addDays(d, -1)) {
    if (!visibleTasks(d).some((x) => x.id === t.id)) continue;
    const full = unitFractions(d, t).every((f) => f >= 1);
    if (full) n++;
    else if (d !== today) break; // сегодня ещё можно успеть
  }
  return n;
}

// Достижения. img — картинка в /img (если файла нет, показывается значок)
const ACHIEVEMENTS = [
  { id: 'first', icon: '🌅', name: 'Первый шаг', desc: 'Закрыть день на 80%+' },
  { id: 'streak3', icon: '🔥', name: 'Разогрев', desc: 'Серия 3 дня' },
  { id: 'streak7', icon: '⚔️', name: 'Неделя без срывов', desc: 'Серия 7 дней' },
  { id: 'streak14', icon: '🏔️', name: 'Две недели', desc: 'Серия 14 дней' },
  { id: 'streak30', icon: '🐉', name: 'Месяц силы', desc: 'Серия 30 дней' },
  { id: 'perfect', icon: '✨', name: 'Идеальный день', desc: 'Все дела дня на 100%' },
  { id: 'perfect5', icon: '🌟', name: 'Пять идеальных', desc: '5 идеальных дней' },
  { id: 'lvl5', icon: '🥉', name: 'Уровень 5', desc: 'Дойти до 5 уровня' },
  { id: 'lvl10', icon: '🥈', name: 'Уровень 10', desc: 'Дойти до 10 уровня' },
  { id: 'lvl20', icon: '🥇', name: 'Уровень 20', desc: 'Дойти до 20 уровня' },
  { id: 'water7', icon: '💧', name: 'Река', desc: 'Норма воды 7 дней подряд' },
  { id: 'smoke7', icon: '🚭', name: 'Под контролем', desc: 'Сигареты в лимите 7 дней подряд' },
  { id: 'gym10', icon: '🏋️', name: 'Железо', desc: '10 тренировок' },
  { id: 'food7', icon: '🍽️', name: 'Летописец', desc: 'Дневник питания 7 дней' },
  { id: 'xp5000', icon: '⚡', name: 'Пять тысяч', desc: 'Набрать 5000 XP' },
  { id: 'final', icon: '🎆', name: 'До Нового года', desc: 'Дойти до 31 декабря' },
];

// Всё о прогрессе разом — считается при каждой отрисовке
function gameSummary() {
  const today = ymd(new Date());
  const last = today < gameEnd() ? today : gameEnd();
  const days = [];
  for (let d = gameStart(); d <= last; d = addDays(d, 1)) days.push(dayCalc(d));
  const total = days.reduce((a, d) => a + d.net, 0);
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  const weekAgo = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  const weekCut = addDays(today, -7);
  for (const d of days) {
    for (const [k, v] of Object.entries(d.byStat)) {
      stats[k] += v;
      if (d.date <= weekCut) weekAgo[k] += v;
    }
  }
  // Общая серия: дни подряд, закрытые на 80%+ (сегодня — если уже закрыт)
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].ratio >= 0.8) streak++;
    else if (days[i].date !== today) break;
  }
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = d.ratio >= 0.8 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const month = today.slice(0, 7);
  const seasonXp = days.filter((d) => d.date.startsWith(month)).reduce((a, d) => a + d.net, 0);

  // Для достижений
  const perfect = days.filter((d) => d.max && d.ratio >= 1).length;
  const runOf = (pred) => {
    let r = 0;
    let m = 0;
    for (const d of days) {
      if (d.date === today && !pred(d)) continue;
      r = pred(d) ? r + 1 : 0;
      m = Math.max(m, r);
    }
    return m;
  };
  const itemFull = (d, test) => d.items.some((it) => test(it.t) && it.full);
  const water = runOf((d) => itemFull(d, (t) => t.counter && t.counter.unit === 'мл'));
  const smoke = runOf((d) => d.date < today && itemFull(d, (t) => isLimit(t)));
  let gym = 0;
  for (const d of days) {
    for (const it of d.items) {
      const fs = unitFractions(d.date, it.t);
      units(it.t).forEach((u, i) => {
        if (u.stat === 'str' && fs[i] >= 1) gym++;
      });
    }
  }
  const foodDays = Object.keys(state.food || {}).filter((d) => d >= gameStart() && (state.food[d] || []).length).length;
  const lvl = levelOf(Math.max(0, total)).level;
  const got = {
    first: days.some((d) => d.ratio >= 0.8), streak3: best >= 3, streak7: best >= 7, streak14: best >= 14, streak30: best >= 30,
    perfect: perfect >= 1, perfect5: perfect >= 5, lvl5: lvl >= 5, lvl10: lvl >= 10, lvl20: lvl >= 20,
    water7: water >= 7, smoke7: smoke >= 7, gym10: gym >= 10, food7: foodDays >= 7, xp5000: total >= 5000, final: today >= gameEnd(),
  };
  return { today, days, total, stats, weekAgo, streak, best, seasonXp, got, unlocked: ACHIEVEMENTS.filter((a) => got[a.id]).length };
}

let G = null; // последняя сводка, обновляется в renderGame

// ——— Шапка игры во вкладке «Дела» ———
function renderGameBar() {
  const date = ymd(todoDay());
  const n = gameDayN(date);
  const L = levelOf(Math.max(0, G.total));
  const inGame = date >= gameStart() && date <= gameEnd();
  const pct = Math.round(((Math.max(0, G.total) - L.from) / (L.to - L.from)) * 100);
  const today = dayCalc(G.today);
  const hour = new Date().getHours();
  const yesterday = G.days.find((d) => d.date === addDays(G.today, -1));

  // Чекап: вечером — что спишется в полночь; утром — итог вчера
  let checkup = '';
  if (date === G.today && hour >= 21) {
    const left = today.items.filter((it) => !it.full && !it.t.once);
    const minus = left.reduce((a, it) => a + (it.max - it.gain), 0);
    checkup = left.length
      ? `<div class="checkup warn"><b>Чекап дня</b><span>Не отмечено: ${left.length}. В 00:00 спишется <b>−${minus} XP</b>. Отметь, что уже сделал.</span></div>`
      : '<div class="checkup ok"><b>Чекап дня</b><span>Всё отмечено — день закрыт без потерь 💪</span></div>';
  } else if (date === G.today && hour < 12 && yesterday) {
    checkup = `<div class="checkup"><b>Итог вчера</b><span>+${yesterday.gain} XP · −${yesterday.loss} XP · итого <b>${yesterday.net >= 0 ? '+' : ''}${yesterday.net}</b></span></div>`;
  }

  $('#game-bar').innerHTML = `
    <div class="gb-chips">
      <span class="chip fire" title="Серия дней">🔥 ${G.streak}</span>
      <span class="chip" title="Достижения">🏆 ${G.unlocked}</span>
      <span class="chip" title="Опыт">⚡ ${G.total}</span>
      <button class="chip lvl" data-tab="game" title="Профиль игрока">Ур. ${L.level}</button>
    </div>
    ${inGame ? `<div class="gb-day"><span class="gb-n">ДЕНЬ ${n}</span><span class="gb-of">/ ${gameLength()}</span></div>` : ''}
    <div class="lvl-bar" title="${G.total} XP"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
    <div class="kcal gb-sub">${L.to - Math.max(0, G.total)} XP до уровня ${L.level + 1} · сегодня +${today.gain} из ${today.max}</div>
    ${checkup}`;
}

// ——— Вкладка «Игра» ———
function radarSvg(now, before) {
  const max = Math.max(50, ...STAT_KEYS.map((k) => now[k]));
  const R = 90;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / STAT_KEYS.length;
    const r = (Math.max(0, v) / max) * R;
    return `${(110 + r * Math.cos(a)).toFixed(1)},${(110 + r * Math.sin(a)).toFixed(1)}`;
  };
  const poly = (vals) => STAT_KEYS.map((k, i) => pt(i, vals[k])).join(' ');
  const grid = [0.33, 0.66, 1].map((s) => `<polygon points="${STAT_KEYS.map((k, i) => pt(i, max * s)).join(' ')}" class="rg"/>`).join('');
  const axes = STAT_KEYS.map((k, i) => {
    const [x, y] = pt(i, max * 1.22).split(',');
    return `<line x1="110" y1="110" x2="${pt(i, max).split(',')[0]}" y2="${pt(i, max).split(',')[1]}" class="rg"/>
      <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${STATS[k].icon} ${STATS[k].short}</text>`;
  }).join('');
  return `<svg viewBox="-20 -10 260 240" class="radar" role="img" aria-label="Профиль характеристик">
    ${grid}${axes}
    <polygon points="${poly(before)}" class="r-before"/>
    <polygon points="${poly(now)}" class="r-now"/>
  </svg>`;
}

function xpChart(days) {
  const last = days.slice(-14);
  if (!last.length) return '';
  const max = Math.max(20, ...last.map((d) => Math.abs(d.net)));
  return `<div class="xp-chart">${last.map((d) => {
    const h = Math.round((Math.abs(d.net) / max) * 100);
    const lbl = new Date(d.date + 'T00:00').getDate();
    return `<div class="xc-col" title="${d.date}: ${d.net >= 0 ? '+' : ''}${d.net} XP"><div class="xc-bar ${d.net < 0 ? 'neg' : ''}" style="height:${Math.max(3, h)}%"></div><span>${lbl}</span></div>`;
  }).join('')}</div>`;
}

// Неделя по каждому ежедневному делу: Пн…Вс
function weekGrid() {
  const today = G.today;
  const monday = addDays(today, -((new Date(today + 'T00:00').getDay() + 6) % 7));
  const dates = [...Array(7)].map((_, i) => addDays(monday, i));
  const tasks = routine().filter((t) => !t.once && !t.date && units(t).length);
  return tasks.map((t) => {
    const cells = dates.map((d, i) => {
      const name = WEEK[i][1][0];
      if (d < gameStart() || !visibleTasks(d).some((x) => x.id === t.id)) return `<span class="wd off">${name}</span>`;
      if (d > today) return `<span class="wd">${name}</span>`;
      const full = unitFractions(d, t).every((f) => f >= 1);
      return `<span class="wd ${full ? 'on' : d < today ? 'miss' : ''}">${name}</span>`;
    }).join('');
    const doneN = dates.filter((d) => d <= today && d >= gameStart() && visibleTasks(d).some((x) => x.id === t.id) && unitFractions(d, t).every((f) => f >= 1)).length;
    return `<div class="wk-row"><div><b>${esc(t.title)}</b><span class="kcal">${doneN}× на этой неделе</span></div><div class="wk-cells">${cells}</div></div>`;
  }).join('');
}

function beforeAfter() {
  const tiles = [];
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const series = (pred) => G.days.filter((d) => d.date < G.today).map((d) => {
    const t = visibleTasks(d.date).find(pred);
    return t ? count(d.date, t) : null;
  }).filter((v) => v !== null);
  const water = series((t) => t.counter && t.counter.unit === 'мл');
  if (water.length >= 2) tiles.push(['💧', 'Вода в день', `${(avg(water.slice(0, 3)) / 1000).toFixed(1)} л`, `${(avg(water.slice(-3)) / 1000).toFixed(1)} л`]);
  const smoke = series((t) => isLimit(t));
  if (smoke.length >= 2) tiles.push(['🚬', 'Сигареты', Math.round(avg(smoke.slice(0, 3))), Math.round(avg(smoke.slice(-3)))]);
  const ws = (state.weights || []).filter((w) => w.date >= gameStart());
  if (ws.length >= 1) tiles.push(['⚖️', 'Вес', `${ws[0].kg} кг`, `${ws.at(-1).kg} кг`]);
  if (!tiles.length) return '<p class="empty">Появится через пару дней игры: вода, сигареты и вес — как было и как стало.</p>';
  return `<div class="ba">${tiles.map(([i, n, a, b]) => `<div class="ba-tile"><span class="kcal">${i} ${n}</span><span class="ba-was">было ${a}</span><b>${b}</b></div>`).join('')}</div>`;
}

function renderGameTab() {
  const L = levelOf(Math.max(0, G.total));
  const pct = Math.round(((Math.max(0, G.total) - L.from) / (L.to - L.from)) * 100);
  const rank = rankOf(G.seasonXp);
  const monthName = new Date().toLocaleDateString('ru-RU', { month: 'long' });
  const endDays = Math.max(0, gameDayN(gameEnd()) - gameDayN(G.today));
  $('#game-tab').innerHTML = `
    <div class="card g-level">
      <div class="g-lvl-badge"><b>${L.level}</b><span>уровень</span></div>
      <div class="g-lvl-main"><b class="g-xp">${G.total.toLocaleString('ru-RU')}</b><span class="kcal">получено XP</span></div>
      <div class="seg-bar">${[...Array(20)].map((_, i) => `<i class="${i < Math.round(pct / 5) ? 'on' : ''}"></i>`).join('')}</div>
      <div class="kcal g-center">${L.to - Math.max(0, G.total)} XP до уровня ${L.level + 1} · день ${Math.min(gameDayN(G.today), gameLength())} из ${gameLength()} · до финиша ${endDays} дн.</div>
    </div>

    <h3 class="cat"><span>Сезон · ${monthName}</span><span>${G.seasonXp} XP</span></h3>
    <div class="card g-season tier-${rank.tier}">
      <div><b class="g-rank">${rank.name}</b><span class="kcal">${rank.next ? `${rank.toNext} XP до ${rank.next}` : 'Максимальный ранг'}</span></div>
      <div class="bar"><span style="width:${Math.round(rank.pct * 100)}%"></span></div>
    </div>

    <h3 class="cat"><span>Характеристики</span><span class="kcal">пунктир — неделю назад</span></h3>
    <div class="card g-stats">
      ${radarSvg(G.stats, G.weekAgo)}
      ${STAT_KEYS.map((k) => `<div class="g-stat"><span>${STATS[k].icon} ${STATS[k].name}</span><b>${G.stats[k]}</b><span class="up">${G.stats[k] - G.weekAgo[k] > 0 ? '▲ ' + (G.stats[k] - G.weekAgo[k]) : ''}</span></div>`).join('')}
    </div>

    <h3 class="cat"><span>XP по дням</span><span class="kcal">лучшая серия ${G.best}</span></h3>
    <div class="card">${xpChart(G.days)}</div>

    <h3 class="cat"><span>Эта неделя</span></h3>
    <div class="card wk">${weekGrid() || '<p class="empty">Нет ежедневных дел</p>'}</div>

    <h3 class="cat"><span>До и после</span></h3>
    <div class="card">${beforeAfter()}</div>

    <h3 class="cat"><span>Достижения</span><span>${G.unlocked}/${ACHIEVEMENTS.length}</span></h3>
    <div class="ach-grid">${ACHIEVEMENTS.map((a) => {
      const on = G.got[a.id];
      return `<div class="ach ${on ? 'on' : ''}" title="${esc(a.desc)}">
        ${on ? `<img src="img/ach-${a.id}.jpg" alt="" onerror="this.remove()"><span class="ach-icon">${a.icon}</span>` : '<span class="ach-icon q">?</span>'}
        <b>${esc(a.name)}</b><span class="kcal">${esc(a.desc)}</span>
      </div>`;
    }).join('')}</div>

    <h3 class="cat"><span>Правила игры</span></h3>
    <ul class="card rules">
      <li>За каждое дело — опыт (XP): галочка 20, счётчик 30, каждый подпункт 10. Неполный счётчик — часть опыта.</li>
      <li>В 00:00 за невыполненное <b>списывается столько же XP</b>, сколько дало бы выполнение. Разовые «пока не сделаю» не штрафуются.</li>
      <li>Сигареты: в лимите — +XP, сверх лимита — −XP.</li>
      <li>Серия 🔥 — дни подряд, закрытые на 80%+. У каждого дела своя серия.</li>
      <li>Сезон — месяц: ранг считается по XP за месяц. Игра идёт до ${new Date(gameEnd() + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.</li>
    </ul>`;
}

function renderGame() {
  if (!plan || !state.routine) return;
  G = gameSummary();
  renderGameBar();
  renderGameTab();
}

// Для карточек дел: серия и опыт
function gameBadges(date, t) {
  const us = units(t);
  if (!us.length) return '<span class="badge soft">вне игры</span>';
  const max = us.reduce((a, u) => a + u.xp, 0);
  const streak = date === ymd(new Date()) ? taskStreak(t, date) : 0;
  return `${streak ? `<span class="badge streak">🔥 ${streak} д.</span>` : ''}<span class="badge xp">+${max} XP</span>`;
}
