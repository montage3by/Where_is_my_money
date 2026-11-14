// ——— Осознанность: вечерняя запись дня → Claude оценивает состояние 1–5 и разбирает день ———
// Данные — state.mind[YYYY-MM-DD] = [{ id, text, at, analysis: { score, mood, stress, energy, summary, triggers, helped, tip, crisis } }]

const MOOD_FACE = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const MOOD_WORD = { 1: 'тяжело', 2: 'так себе', 3: 'ровно', 4: 'хорошо', 5: 'отлично' };
const mindDays = () => state.mind || {};
// Итог дня — разбор последней разобранной записи
const dayMind = (date) => {
  const list = mindDays()[date] || [];
  const x = [...list].reverse().find((e) => e.analysis);
  return x ? x.analysis : null;
};
// Сигареты за день — из дела-счётчика с лимитом
function smokesOn(date) {
  const t = routine().find((x) => x.counter && x.counter.limit && /сигар|кур/i.test(x.title));
  return t ? state.counters[`${t.id}:${date}`] || 0 : null;
}
const fmtDay = (d) => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

function mindStreak(today) {
  let n = 0;
  for (let d = today; ; d = addDays(d, -1)) {
    if ((mindDays()[d] || []).length) n++;
    else if (d !== today) break;
    if (n > 400) break;
  }
  return n;
}

function analysisHtml(a) {
  if (!a) return '';
  const chips = (arr, cls) => arr.map((x) => `<span class="mchip ${cls}">${esc(x)}</span>`).join('');
  return `<div class="m-an">
    <div class="m-score"><span class="m-face">${MOOD_FACE[a.score]}</span>
      <div><b>${a.score}/5 · ${esc(a.mood)}</b><span class="kcal">стресс ${a.stress}/5 · энергия ${a.energy}/5</span></div></div>
    <p>${esc(a.summary)}</p>
    ${a.triggers.length ? `<div class="m-row"><span class="kcal">Выматывало</span>${chips(a.triggers, 'neg')}</div>` : ''}
    ${a.helped.length ? `<div class="m-row"><span class="kcal">Поддержало</span>${chips(a.helped, 'pos')}</div>` : ''}
    ${a.tip ? `<p class="m-tip${a.crisis ? ' crisis' : ''}">💡 ${esc(a.tip)}</p>` : ''}
  </div>`;
}

function entryHtml(date, x) {
  const time = new Date(x.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `<div class="card m-entry">
    <div class="m-head"><span class="kcal">${time}</span><button class="m-del" data-mind-del="${x.id}" data-date="${date}" aria-label="Удалить">×</button></div>
    <p class="m-text">${esc(x.text)}</p>
    ${x.analysis ? analysisHtml(x.analysis) : plan.ai ? `<button class="link-btn m-redo" data-mind-redo="${x.id}" data-date="${date}">Разобрать запись</button>` : ''}
  </div>`;
}

// График: настроение (точки) и сигареты (столбики) за 30 дней
function mindChart(today) {
  const days = [...Array(30)].map((_, i) => addDays(today, i - 29));
  const pts = days.map((d) => ({ d, a: dayMind(d), s: smokesOn(d) }));
  if (!pts.some((p) => p.a)) return '';
  const W = 320, H = 130, L = 8, R = 8, T = 10, B = 18;
  const x = (i) => L + (i * (W - L - R)) / (days.length - 1);
  const y = (v) => T + ((5 - v) * (H - T - B)) / 4;
  const maxS = Math.max(10, ...pts.map((p) => p.s || 0));
  const bars = pts.map((p, i) => (p.s ? `<rect x="${x(i) - 3}" y="${H - B - (p.s / maxS) * (H - T - B) * 0.6}" width="6" height="${(p.s / maxS) * (H - T - B) * 0.6}" class="m-bar"/>` : '')).join('');
  const line = pts.map((p, i) => (p.a ? `${x(i)},${y(p.a.score)}` : null)).filter(Boolean);
  const dots = pts.map((p, i) => (p.a ? `<circle cx="${x(i)}" cy="${y(p.a.score)}" r="3.5" class="m-dot s${p.a.score}"><title>${p.d}: ${p.a.score}/5${p.s != null ? `, сигарет ${p.s}` : ''}</title></circle>` : '')).join('');
  return `<div class="card m-chart">
    <div class="m-head"><span class="kcal">НАСТРОЕНИЕ ЗА 30 ДНЕЙ</span><span class="kcal"><i class="m-key dot"></i>настроение <i class="m-key bar"></i>сигареты</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="pchart">
      ${[1, 3, 5].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}
      ${bars}<polyline points="${line.join(' ')}"/>${dots}
      <text x="${L}" y="${H - 4}" class="d">${shortDate(days[0])}</text><text x="${W - R}" y="${H - 4}" text-anchor="end" class="d">сегодня</text>
    </svg></div>`;
}

// Средние за 7 дней и связь с сигаретами
function mindStats(today) {
  const week = [...Array(7)].map((_, i) => addDays(today, -i)).map((d) => ({ a: dayMind(d), s: smokesOn(d) })).filter((p) => p.a);
  if (!week.length) return '';
  const avg = (f) => (week.reduce((s, p) => s + f(p), 0) / week.length).toFixed(1).replace('.', ',');
  const smoke = week.filter((p) => p.s != null);
  return `<div class="m-stats">
    <div><b>${avg((p) => p.a.score)}</b><span class="kcal">настроение</span></div>
    <div><b>${avg((p) => p.a.stress)}</b><span class="kcal">стресс</span></div>
    <div><b>${avg((p) => p.a.energy)}</b><span class="kcal">энергия</span></div>
    ${smoke.length ? `<div><b>${(smoke.reduce((s, p) => s + p.s, 0) / smoke.length).toFixed(0)}</b><span class="kcal">сигарет/день</span></div>` : ''}
  </div>`;
}

function renderMind() {
  if (!plan || !$('#tab-mind')) return;
  const today = ymd(new Date());
  const todayList = mindDays()[today] || [];
  const a = dayMind(today);
  const streak = mindStreak(today);
  $('#mind-hero').innerHTML = `
    <div class="ph-top"><b>Осознанность</b><span class="kcal">🔥 ${streak} ${streak === 1 ? 'день' : 'дн.'} подряд</span></div>
    <div class="ph-status">${a ? `${MOOD_FACE[a.score]} Сегодня ${a.score}/5 — ${esc(a.mood)}` : todayList.length ? 'Запись есть, ждёт разбора' : 'Как прошёл день? Надиктуй 1–2 минуты'}</div>
    <p class="kcal ph-calc">Лучшее время — вечером, 20:00–22:00. Говори как есть: что было, что бесило, что порадовало, сколько курил, как спал.</p>
    ${mindStats(today)}`;
  $('#mind-today').innerHTML = todayList.map((x) => entryHtml(today, x)).reverse().join('');
  $('#mind-chart').innerHTML = mindChart(today);
  const past = Object.keys(mindDays()).filter((d) => d < today).sort().reverse().slice(0, 30);
  $('#mind-history').innerHTML = past.length
    ? past.map((d) => {
      const da = dayMind(d);
      const s = smokesOn(d);
      return `<details class="card m-day"><summary><span>${da ? MOOD_FACE[da.score] : '📝'}</span><b>${fmtDay(d)}</b>
        <span class="kcal">${da ? `${da.score}/5 · ${esc(da.mood)}` : 'без разбора'}${s ? ` · 🚬 ${s}` : ''}</span></summary>
        ${(mindDays()[d] || []).map((x) => entryHtml(d, x)).join('')}</details>`;
    }).join('')
    : '<p class="empty">Здесь появятся прошлые дни</p>';
  const mic = $('#mind-mic');
  if (mic) mic.hidden = !SpeechRec;
}

// ——— Голос: распознавание речи браузера (если есть), иначе — микрофон на клавиатуре телефона ———
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function toggleMic() {
  const btn = $('#mind-mic');
  const ta = $('#mind-form').text;
  if (rec) { rec.stop(); return; }
  rec = new SpeechRec();
  rec.lang = 'ru-RU';
  rec.continuous = true;
  rec.interimResults = true;
  const base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    ta.value = base + finalText + interim;
  };
  rec.onend = () => { rec = null; btn.classList.remove('on'); btn.textContent = '🎤 Надиктовать'; };
  rec.onerror = (e) => { if (e.error !== 'aborted') toast('Микрофон: ' + (e.error === 'not-allowed' ? 'нет доступа' : e.error)); };
  rec.start();
  btn.classList.add('on');
  btn.textContent = '⏹ Остановить';
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('#mind-mic')) return toggleMic();
  const del = e.target.closest('[data-mind-del]');
  if (del) {
    if (!confirm('Удалить запись?')) return;
    try { await write('/api/mind/delete', { date: del.dataset.date, id: del.dataset.mindDel }); renderMind(); } catch (err) { toast('Ошибка: ' + err.message); }
    return;
  }
  const redo = e.target.closest('[data-mind-redo]');
  if (redo) {
    redo.disabled = true;
    redo.textContent = 'Разбираю…';
    try { await write('/api/mind/analyze', { date: redo.dataset.date, id: redo.dataset.mindRedo }); } catch (err) { toast('Не получилось: ' + err.message); }
    renderMind();
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'mind-form') return;
  e.preventDefault();
  if (rec) rec.stop();
  const f = e.target;
  const text = f.text.value.trim();
  if (!text) return toast('Сначала надиктуй или напиши пару фраз');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = plan.ai ? 'Разбираю…' : 'Сохраняю…';
  try {
    const res = await write('/api/mind', { date: ymd(new Date()), text });
    f.text.value = '';
    render();
    renderMind();
    if (res.warning) toast(res.warning);
  } catch (err) {
    toast('Ошибка: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить и разобрать';
  }
});
