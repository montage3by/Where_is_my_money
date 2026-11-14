// Подсчёт калорий: свободный текст «что съел» → продукты с граммовкой, ккал и БЖУ.
// Нужен ANTHROPIC_API_KEY (Variables на Railway). Без ключа еда записывается без калорий.
const Anthropic = require('@anthropic-ai/sdk');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'kcal', 'protein', 'fat', 'carbs'],
        properties: {
          name: { type: 'string', description: 'Продукт или блюдо по-русски, коротко' },
          grams: { type: 'number', description: 'Вес порции в граммах (или мл для напитков)' },
          kcal: { type: 'number' },
          protein: { type: 'number', description: 'Белки, г' },
          fat: { type: 'number', description: 'Жиры, г' },
          carbs: { type: 'number', description: 'Углеводы, г' },
        },
      },
    },
  },
};

const SYSTEM = `Ты считаешь калории для дневника питания. Пользователь пишет по-русски, что съел, — как попало, с опечатками.
Разбей на продукты и для каждого оцени вес порции, калории и БЖУ по типичным справочным значениям.
- Если вес назван — бери его. Если нет — бери обычную порцию («2 банана» — два средних банана по ~120 г без кожуры, «тарелка супа» — ~300 г).
- Готовые блюда считай целиком как блюдо (хачапури по-аджарски, хинкали — по штукам, шаурма и т.п.), а не по ингредиентам.
- Учитывай способ приготовления (жареное — с маслом).
- Напитки без калорий (вода, чай и кофе без сахара) включай с нулём.
- Если в тексте нет еды — верни пустой items.`;

let client = null;
const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function estimateFood(text) {
  client = client || new Anthropic({ timeout: 60_000 });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // При отказе модели запрос сам перезапускается на запасной модели
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude не стал считать этот текст');
  if (response.stop_reason === 'max_tokens') throw new Error('Не получилось посчитать, попробуй ещё раз');
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Пустой ответ, попробуй ещё раз');
  const r1 = (n) => Math.max(0, Math.round(Number(n) * 10) / 10 || 0);
  const items = JSON.parse(block.text).items.slice(0, 30).map((x) => ({
    name: String(x.name).slice(0, 80), grams: Math.round(r1(x.grams)), kcal: Math.round(r1(x.kcal)),
    p: r1(x.protein), f: r1(x.fat), c: r1(x.carbs),
  }));
  const sum = (k) => Math.round(items.reduce((s, x) => s + x[k], 0) * 10) / 10;
  return { items, kcal: Math.round(sum('kcal')), p: sum('p'), f: sum('f'), c: sum('c') };
}

// ——— Осознанность: запись дня → оценка состояния ———
const SCALE = { type: 'integer', enum: [1, 2, 3, 4, 5] };
const MOOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'mood', 'stress', 'energy', 'summary', 'triggers', 'helped', 'tip', 'crisis'],
  properties: {
    score: { ...SCALE, description: 'Общее ментальное состояние за день: 1 — очень плохо, 3 — нейтрально, 5 — отлично' },
    mood: { type: 'string', description: 'Главная эмоция дня, 1–3 слова по-русски' },
    stress: { ...SCALE, description: 'Уровень стресса и напряжения: 1 — спокойно, 5 — очень сильный' },
    energy: { ...SCALE, description: 'Энергия и силы: 1 — истощение, 5 — бодрость' },
    summary: { type: 'string', description: '2–3 предложения: что происходило и как человек это переживал' },
    triggers: { type: 'array', items: { type: 'string' }, description: 'Что тревожило, злило или выматывало; коротко; пусто, если не было' },
    helped: { type: 'array', items: { type: 'string' }, description: 'Что поддержало, порадовало, помогло; коротко; пусто, если не было' },
    tip: { type: 'string', description: 'Один маленький конкретный шаг на завтра, по-дружески' },
    crisis: { type: 'boolean', description: 'true, только если есть признаки острого кризиса: мысли о самоповреждении или суициде, безнадёжность' },
  },
};

const MOOD_SYSTEM = `Ты помогаешь человеку вести дневник ментального состояния. Каждый вечер он надиктовывает голосом, как прошёл день; текст распознан речью, в нём бывают оговорки.
Твоя задача — бережно и честно оценить состояние и коротко разобрать день, по-русски, на «ты».
- Оценивай по тому, что сказано, не додумывай. Если текст короткий — оценивай по нему, без нравоучений.
- Человек 32 лет, сидит на жёсткой диете (PSMF) и тренируется, бросает курить или сокращает: курит от нервов. Если в тексте есть сигареты, сон, еда, тренировки — учитывай их как факторы.
- В контексте есть прошлые дни: если заметна динамика (лучше или хуже, повторяющийся триггер), упомяни это в summary одной фразой.
- Совет на завтра — один, маленький и выполнимый, без банальностей вроде «больше отдыхай».
- Ты не врач и не ставишь диагнозов. crisis=true — только при явных признаках острого кризиса; тогда в tip мягко предложи прямо сейчас написать или позвонить близкому человеку или специалисту, а при угрозе жизни — 112.`;

async function analyzeMood(text, recent) {
  client = client || new Anthropic({ timeout: 60_000 });
  const context = recent.length
    ? 'Прошлые дни (для динамики):\n' + recent.map((r) => `${r.date}: ${r.score}/5, ${r.mood}; ${r.summary}`).join('\n')
    : 'Прошлых записей пока нет.';
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: MOOD_SCHEMA } },
    system: MOOD_SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\nЗапись сегодня:\n${text}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude не стал разбирать эту запись');
  if (response.stop_reason === 'max_tokens') throw new Error('Не получилось разобрать, попробуй ещё раз');
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Пустой ответ, попробуй ещё раз');
  const r = JSON.parse(block.text);
  const n = (x) => Math.min(5, Math.max(1, Math.round(Number(x)) || 3));
  const list = (a) => (Array.isArray(a) ? a.map((x) => String(x).slice(0, 120)).slice(0, 6) : []);
  return {
    score: n(r.score), stress: n(r.stress), energy: n(r.energy),
    mood: String(r.mood || '').slice(0, 40), summary: String(r.summary || '').slice(0, 600),
    triggers: list(r.triggers), helped: list(r.helped), tip: String(r.tip || '').slice(0, 300), crisis: Boolean(r.crisis),
  };
}

// Понятный текст ошибки для пользователя
function errorText(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'ключ ANTHROPIC_API_KEY не подходит';
  if (e instanceof Anthropic.RateLimitError) return 'слишком много запросов, попробуй через минуту';
  if (e instanceof Anthropic.APIError) return `Claude недоступен (${e.status ?? 'сеть'})`;
  return e.message;
}

module.exports = { enabled, estimateFood, analyzeMood, errorText };
