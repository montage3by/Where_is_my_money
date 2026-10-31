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

// Понятный текст ошибки для пользователя
function errorText(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'ключ ANTHROPIC_API_KEY не подходит';
  if (e instanceof Anthropic.RateLimitError) return 'слишком много запросов, попробуй через минуту';
  if (e instanceof Anthropic.APIError) return `Claude недоступен (${e.status ?? 'сеть'})`;
  return e.message;
}

module.exports = { enabled, estimateFood, errorText };
