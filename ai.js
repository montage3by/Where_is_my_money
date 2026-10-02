// Надиктованный текст → дела. Claude разбирает свободную речь в список дел
// в том же формате, что и форма на сайте; проверку делает cleanTask в server.js.
const Anthropic = require('@anthropic-ai/sdk');
const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
const { z } = require('zod');

const TaskDraft = z.object({
  title: z.string().describe('Короткое название дела по-русски, с заглавной буквы'),
  start: z.string().describe('Время начала ЧЧ:ММ или пустая строка'),
  end: z.string().describe('Время окончания / дедлайн ЧЧ:ММ или пустая строка'),
  kind: z.enum(['simple', 'subtasks', 'counter']),
  subtasks: z.array(z.string()).describe('Подпункты для kind=subtasks, иначе пустой массив'),
  target: z.number().int().describe('Цель для kind=counter, иначе 0'),
  details: z.string().describe('Пояснение, если в речи были условия или детали; иначе пустая строка'),
  when: z.enum(['date', 'once', 'daily']),
  date: z.string().describe('YYYY-MM-DD: день дела (when=date) или с какого дня (when=once); для daily — пустая строка'),
});
const Result = z.object({ tasks: z.array(TaskDraft) });

const SYSTEM = `Ты разбираешь надиктованную речь пользователя на дела для его трекера дня.
Речь распознана голосом: в ней бывают оговорки, повторы, «э-э», исправления на ходу — учитывай последнюю версию сказанного.

Правила:
- Каждое отдельное дело — отдельный элемент tasks. Если перечислено несколько пунктов одной темы («оплатить офис, КУ и две кредитки»), сделай одно дело с подпунктами (kind=subtasks), а не несколько дел.
- Если названо количество, которое нужно набрать («100 откликов», «10 билетов»), это kind=counter с target.
- when: «date» — дело на конкретный день (по умолчанию, если не сказано иное); «once» — если сказано «пока не сделаю», «висит пока не сделаю», «до выполнения»; «daily» — «каждый день», «ежедневно».
- Если день не назван, бери выбранный день из контекста. Относительные даты («завтра», «в субботу», «послезавтра») считай от сегодняшней даты по календарю из контекста.
- Время — только если оно названо в речи. «В 8 вечера» → start 20:00. «До семи» → end 19:00.
- Названия короткие и в повелительной форме, как в списке дел: «Позвонить маме», «Купить зонт». Не выдумывай дел, которых не было в речи.
- Если в речи нет ни одного дела, верни пустой tasks.`;

function calendar(today) {
  const names = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const d = new Date(`${today}T12:00:00Z`);
  const lines = [];
  for (let i = 0; i < 14; i++) {
    const x = new Date(d.getTime() + i * 86400000);
    lines.push(`${x.toISOString().slice(0, 10)} — ${names[x.getUTCDay()]}${i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : ''}`);
  }
  return lines.join('\n');
}

let client = null;
const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function parseTasks({ text, today, selectedDate, existingTitles }) {
  client = client || new Anthropic({ timeout: 90_000 });
  const context = `Сегодня: ${today}. Выбранный в трекере день: ${selectedDate}.
Календарь:
${calendar(today)}

Дела, которые уже есть в трекере (не дублируй их): ${existingTitles.join('; ') || 'нет'}`;

  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // При отказе модели запрос сам перезапускается на запасной модели
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Result) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\nРечь пользователя:\n${text}` }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude не стал разбирать этот текст');
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('Не получилось разобрать ответ, попробуй ещё раз');
  return response.parsed_output.tasks;
}

module.exports = { enabled, parseTasks };
