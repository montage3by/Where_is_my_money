"""Sunrock marketing report, October 2026 — branded deck (HTML → PDF via render.mjs)."""
from pathlib import Path

OUT = Path(__file__).parent / "oct_report.html"
KNOT = (Path(__file__).parent / "gpt.html").read_text().split('<symbol id="knot"', 1)[1].split("</symbol>", 1)[0]

CSS = """
.body{position:absolute;left:80px;right:80px;top:262px;bottom:150px}
.kpis{display:grid;gap:24px}
.kpi{border:1px solid var(--line);padding:30px 32px;background:#fff}
.kpi .k{font-size:19px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.kpi .v{font-family:PF;font-size:64px;color:var(--gold);line-height:1}
.kpi .d{font-size:21px;color:var(--muted);margin-top:14px;line-height:1.35}
.kpi.g{background:var(--green);border-color:var(--green)} .kpi.g .v{color:var(--gold-l)} .kpi.g .k,.kpi.g .d{color:rgba(255,255,255,.75)}
table{width:100%;border-collapse:collapse;font-size:23px}
th{text-align:left;font-weight:600;font-size:16px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);padding:0 14px 14px;border-bottom:1px solid var(--gold)}
td{padding:14px;border-bottom:1px solid var(--line);vertical-align:top}
td.n,th.n{text-align:right;white-space:nowrap}
tr.tot td{font-weight:600;border-top:1px solid var(--gold);border-bottom:0}
.up{color:var(--green);font-weight:600} .em{color:var(--gold);font-weight:600}
.tag{display:inline-block;font-size:15px;letter-spacing:1px;text-transform:uppercase;padding:3px 10px;border:1px solid var(--line);color:var(--muted)}
.tag.buy{border-color:var(--gold);color:var(--gold)} .tag.prod{background:var(--sand);border-color:var(--sand);color:var(--green)}
.cols{display:grid;gap:40px}
.box{border:1px solid var(--line);padding:32px 36px}
.box h3{font-family:PF;font-weight:400;font-size:32px;color:var(--gold);text-transform:uppercase;margin-bottom:20px;letter-spacing:.5px}
.box.g{background:var(--green);border-color:var(--green);color:#fff} .box.g h3{color:var(--gold-l)}
ul.dia{list-style:none;display:flex;flex-direction:column;gap:14px}
ul.dia li{font-size:23px;line-height:1.4;padding-left:30px;position:relative}
ul.dia li::before{content:"";position:absolute;left:4px;top:12px;width:10px;height:10px;background:var(--gold);transform:rotate(45deg)}
.box.g ul.dia li::before{background:var(--gold-l)}
ol.num{list-style:none;counter-reset:n;display:flex;flex-direction:column;gap:14px}
ol.num li{counter-increment:n;font-size:23px;line-height:1.4;padding-left:48px;position:relative}
ol.num li::before{content:counter(n,decimal-leading-zero);position:absolute;left:0;top:-2px;font-family:PF;color:var(--gold);font-size:26px}
.lead{font-size:26px;line-height:1.45;color:var(--ink)}
.strip{background:var(--green);color:#fff;padding:24px 36px;font-size:24px;line-height:1.45} .strip b{color:var(--gold-l);font-weight:600}
.step{display:grid;grid-template-columns:200px 1fr;gap:24px;padding:16px 0;border-bottom:1px solid var(--line);font-size:23px;line-height:1.4}
.step .w{font-family:PF;color:var(--gold);font-size:26px}
.knot{display:flex;align-items:center;gap:14px;font-family:I;font-weight:600;font-size:52px;color:#000}
.knot svg{width:64px;height:64px}
.sec{display:inline-block;font-size:18px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);position:absolute;left:82px;top:228px}
.cover .pill{display:flex;align-items:center;gap:18px;color:var(--gold-l);font-family:I;font-weight:600;font-size:50px;margin-top:22px}
"""

def slide(title, sub, body, plat="", sec=""):
    s = f'<div class="sub">{sub}</div>' if sub else ""
    return f"""<section class="slide">
  <div class="runner">Sunrock Residences · Октябрь 2026</div><img class="emb" src="assets/emblem_gold.png" alt="">
  <h1>{title}</h1>{s}
  <div class="body">{body}</div>
  <div class="plat">{plat}</div>
</section>"""

def kpis(items, cols=4):
    cells = "".join(f'<div class="kpi{" g" if g else ""}"><div class="k">{k}</div><div class="v">{v}</div><div class="d">{d}</div></div>' for k, v, d, g in items)
    return f'<div class="kpis" style="grid-template-columns:repeat({cols},1fr)">{cells}</div>'

def table(head, rows, num=(), tot=None):
    th = "".join(f'<th class="{"n" if i in num else ""}">{h}</th>' for i, h in enumerate(head))
    def tr(r, cls=""):
        return f'<tr class="{cls}">' + "".join(f'<td class="{"n" if i in num else ""}">{c}</td>' for i, c in enumerate(r)) + "</tr>"
    body = "".join(tr(r) for r in rows) + (tr(tot, "tot") if tot else "")
    return f"<table><tr>{th}</tr>{body}</table>"

GADS = '<img src="assets/gads.png" style="height:84px">'
YT = '<img src="assets/youtube.png" style="height:58px">'
SR = '<img src="assets/sunrock_gold_h.png" style="height:52px">'
GPT = f'<div class="knot"><svg viewBox="0 0 320 320"><path fill="currentColor"{KNOT.split("<path fill=\"currentColor\"",1)[1]}</svg>ChatGPT</div>'

S = []

# 1. cover
S.append("""<section class="slide cover">
  <div class="photo" style="background-image:url(assets/ph_aerial.jpg);background-position:38% 50%"></div>
  <div class="panel"><div class="inner">
    <div class="kick">Маркетинговый <span class="s">отчёт</span></div>
    <img class="logo" src="assets/logo_gold.png" alt="Sunrock Residences">
    <div class="date">Октябрь 2026</div>
  </div><img class="agency" src="assets/wizard_gold.png" alt=""></div>
</section>""")

# 2. summary
S.append(slide("Итоги <span class='s'>месяца</span>", "Ключевые результаты октября по всем направлениям", kpis([
    ("SEO · статьи", "18", "9 тем на EN и RU, 9 030 слов", False),
    ("SEO · техника", "301", "страница: исправлен canonical, карта сайта без ошибок", False),
    ("Google Ads · клики", "4 288", "1,15 млн показов, €0,40 за клик", False),
    ("Google Ads · Actions", "2 028", "по €0,85 за действие", True),
    ("YouTube · просмотры", "61 998", "+111% к обычному уровню", False),
    ("YouTube · подписчики", "+690", "всего 15 716 на канале", False),
    ("Расход Google Ads", "€1 724", "за 1–31 октября", False),
    ("ChatGPT Ads", "Готов", "кабинет создан и настроен к запуску", True),
], 4)))

# 3. SEO content
S.append(slide("SEO: <span class='s'>контент</span>", "Статьи блога: октябрь в сравнении с сентябрём",
    kpis([("Статей", "18", "9 EN + 9 RU", True), ("Тем", "9", "каждая на двух языках", False),
          ("Слов", "9 030", "+10% к сентябрю", False), ("Ритм", "2 / нед.", "публикации без пропусков", False)], 4)
    + '<div style="height:36px"></div>'
    + table(["Показатель", "Сентябрь", "Октябрь", "Динамика"], [
        ["Статей всего", "16", "18", "<span class='up'>+12,5%</span>"],
        ["Объём текста, слов", "8 177", "9 030", "<span class='up'>+10%</span>"],
        ["С заполненным SEO-title", "10 из 16", "13 из 18", "<span class='up'>63% → 72%</span>"],
        ["С заполненным meta description", "12 из 16", "14 из 18", "<span class='up'>75% → 78%</span>"],
        ["Внутренних ссылок на статью", "1,8", "1,9", "у всех статей"],
    ], num=(1, 2, 3)), plat=SR))

# 4. SEO topics
B, P, L = "<span class='tag buy'>покупка</span>", "<span class='tag prod'>продукт</span>", "<span class='tag'>lifestyle</span>"
S.append(slide("SEO: <span class='s'>темы октября</span>", "Треть тем отвечает на вопросы покупателя на этапе выбора", table(
    ["Дата", "Тема (EN + RU)", "Интент"], [
        ["01.10", "The Spirit of Dionysus in Limassol: как хранить кипрское вино дома", L],
        ["05.10", "How to Check a New-Build Property in Cyprus Before Buying", B],
        ["08.10", "Classical Motifs in Contemporary Fashion and Interiors", L],
        ["12.10", "How Much Does Comfort Cost in Cyprus? Энергоэффективность квартиры", B],
        ["15.10", "Is Cyprus Safe to Live In? What Families Should Know", B],
        ["19.10", "Wellness Real Estate in Limassol: инфраструктура на территории", P],
        ["22.10", "A Home That Reflects Your Personality", P],
        ["26.10", "A Garden Throughout the Day: Green Pathways at Sunrock", P],
        ["29.10", "Horse Riding in Cyprus: Riding Schools and Coastal Rides", L],
    ]), plat=SR))

# 5. SEO technical
S.append(slide("SEO: <span class='s'>техническая оптимизация</span>", "Аудит 308 страниц и исправление ошибок, мешавших индексации",
    table(["Проблема", "Было", "Стало"], [
        ["Canonical указывал на главную: поисковик считал страницы копиями", "301 из 308", "<span class='up'>0</span>"],
        ["Дубли мета-тегов: 2–3 title и description на странице", "все страницы", "<span class='up'>1 + 1</span>"],
        ["Конфликт двух SEO-плагинов (Yoast + AIOSEO)", "оба активны", "<span class='up'>один, данные перенесены</span>"],
        ["Опечатка в бренде «Sunrock Resindences» в title", "308 страниц", "<span class='up'>исправлено</span>"],
        ["Ошибочные правила robots.txt, грозившие закрыть RU-версию", "14 правил", "<span class='up'>удалены</span>"],
        ["Карт сайта в robots.txt", "3", "<span class='up'>1</span>"],
        ["Тестовая страница в карте сайта", "есть", "<span class='up'>исключена</span>"],
    ]) + '<div style="height:28px"></div><div class="strip">Карта сайта: <b>307 адресов</b>, все отвечают 200, каждый с canonical на себя, без noindex, XML валиден. Переотправлена в Google Search Console.</div>',
    plat=SR))

# 6. GEO
S.append(slide("ГЕО-<span class='s'>оптимизация</span>", "Видимость в ответах ИИ: ChatGPT, Gemini, Perplexity, Google AI Overviews",
    '<div class="cols" style="grid-template-columns:1fr 1fr">'
    + '<div class="box"><h3>Заложено в контенте</h3><ul class="dia">'
    + "<li>Заголовки-вопросы, которые пользователи задают ИИ: «Is Cyprus Safe to Live In?», «How to Check a New-Build…»</li>"
    + "<li>Структура для извлечения ответов: 4–5 блоков H2, списки, вопросы-ответы</li>"
    + "<li>Каждая тема на EN и RU: Sunrock в ответах ИИ на двух языках</li>"
    + "<li>Микроразметка BlogPosting, Organization, BreadcrumbList</li>"
    + "<li>Связка бренда с локацией: Sunrock + Limassol + Germasogeia</li></ul></div>"
    + '<div class="box g"><h3>План на ноябрь</h3><ol class="num">'
    + "<li>Связать EN↔RU версии статей (hreflang)</li>"
    + "<li>Блоки FAQ с разметкой FAQPage в коммерческих статьях и на страницах квартир</li>"
    + "<li>Файл llms.txt — навигатор по сайту для ИИ-систем</li>"
    + "<li>Больше фактов в статьях: цифры, расстояния, сроки, таблицы</li>"
    + "<li>Ежемесячный мониторинг 20 запросов в ChatGPT, Perplexity, Gemini</li></ol></div></div>",
    plat=SR))

# 7. Google Ads summary
S.append(slide("Google Ads: <span class='s'>итоги</span>", "1–31 октября, все активные кампании", kpis([
    ("Показы", "1,15 млн", "1 150 047", False), ("Клики", "4 288", "CTR 0,37%", False),
    ("Цена клика", "€0,40", "в среднем по аккаунту", False), ("Расход", "€1 724", "€1 724,19", False),
    ("Actions", "2 028", "целевые действия", True), ("Цена Action", "€0,85", "в среднем", False),
    ("Доля показов", "14%", "рост с 7% за месяц", False), ("Кампаний", "3", "активных в октябре", False),
], 4), plat=GADS))

# 8. Google Ads campaigns
S.append(slide("Google Ads: <span class='s'>кампании</span>", "Результаты по активным кампаниям",
    table(["Кампания", "Тип", "Бюджет/день", "Показы", "Клики", "CTR", "Расход", "Actions", "Цена Action"], [
        ["Sunrock YouTube", "Demand Gen", "€20", "1 139 647", "3 626", "0,32%", "€1 709,70", "2 028", "€0,84"],
        ["Main RU", "Performance Max", "€10", "8 669", "477", "5,50%*", "€10,95", "—", "—"],
        ["Sunrock — main ENG", "Performance Max", "€10", "1 731", "185", "10,69%*", "€3,54", "—", "—"],
    ], num=(2, 3, 4, 5, 6, 7, 8), tot=["Итого", "", "", "1 150 047", "4 288", "0,37%", "€1 724,19", "2 028", "€0,85"])
    + '<div style="height:30px"></div><div class="cols" style="grid-template-columns:1fr 1fr 1fr">'
    + '<div class="box"><h3>YouTube</h3><p class="lead" style="font-size:22px">99% показов и расхода, 2 028 действий по €0,84. Упирается в дневной бюджет: есть запас для роста.</p></div>'
    + '<div class="box"><h3>Performance Max</h3><p class="lead" style="font-size:22px">Высокий отклик при минимальном расходе: алгоритм на этапе обучения.</p></div>'
    + '<div class="box"><h3>Аукцион</h3><p class="lead" style="font-size:22px">Доля показов выросла с 7% до 14%. Конкурент leptosestates.com — с 10% до 25%.</p></div></div>',
    plat=GADS) .replace('<div class="plat">', '<div class="note">* Высокий CTR характерен для PMax на старте: часть показов идёт в приложениях и медийной сети. В ноябре проверим площадки и качество трафика в GA4.</div><div class="plat">'))

# 9. ChatGPT Ads status
S.append(slide("ChatGPT Ads: <span class='s'>статус</span>", "Sunrock — среди первых застройщиков Кипра в рекламе ChatGPT",
    table(["Этап", "Статус"], [
        ["Исследование площадки и правил", "<span class='up'>✓ готово</span>"],
        ["Создание рекламного кабинета (Ads Manager)", "<span class='up'>✓ создан</span>"],
        ["Настройка кабинета", "<span class='up'>✓ настроен</span>"],
        ["Привязка карты для оплаты", "<span class='em'>ожидает: нужна карта клиента</span>"],
        ["Запуск кампаний", "после привязки карты"],
    ]) + '<div style="height:36px"></div>'
    + kpis([("Бюджет теста", "€1 000", "в месяц, ≈ €33 в день", True), ("Срок", "4 недели", "тестовый период", False),
            ("География", "Кипр + ЕС", "Free и Go, 18+", False), ("Переходы", "200–500", "ориентир при €2–5 за клик", False)], 4),
    plat=GPT))

# 10. ChatGPT Ads plan
S.append(slide("ChatGPT Ads: <span class='s'>план на месяц</span>", "Две кампании по €500 с lifestyle-подачей в рамках правил площадки",
    table(["Кампания", "Бюджет", "Контекст показа", "Посадочная"], [
        ["Lifestyle Limassol (EN)", "€500", "переезд на Кипр, жизнь в Лимассоле, семья у моря", "страница локации"],
        ["Germasogeia Guide (EN)", "€500", "районы Лимассола, школы, пляжи, инфраструктура", "страница удобств"],
    ], num=(1,)) + '<div style="height:28px"></div>'
    + "".join(f'<div class="step"><div class="w">{w}</div><div>{t}</div></div>' for w, t in [
        ("Неделя 0", "Карта, пиксель OpenAI, цель «заявка» в GA4, UTM-ссылки, модерация объявлений"),
        ("Неделя 1", "Запуск по €17/день на кампанию, по 3 варианта объявлений"),
        ("Неделя 2", "Анализ CTR и вовлечённости, отключение слабых вариантов"),
        ("Неделя 3", "Перераспределение бюджета в пользу лучшей кампании, новые заголовки"),
        ("Неделя 4", "Итоги, сравнение с Google Ads, решение о масштабировании"),
    ]), plat=GPT))

# 11. YouTube KPIs
S.append(slide("YouTube: <span class='s'>канал</span>", "8 октября — 4 ноября (28 дней)", kpis([
    ("Просмотры", "61 998", "+111% к обычным 26–40 тыс.", True), ("Из рекламы", "60 807", "98% просмотров", False),
    ("Время просмотра", "149,6 ч", "средний просмотр 0:27", False), ("Подписчики", "+690", "пришло 1 650, всего 15 716", False),
    ("Показы обложек", "5 929", "CTR обложек 2,2%", False), ("Кипр", "91%", "56 532 просмотра", False),
    ("Топ-2 ролика", "97%", "просмотров канала", False), ("Подписки из рекламы", "+1 555", "96% новых подписчиков", False),
], 4), plat=YT))

# 12. YouTube content + geo
S.append(slide("YouTube: <span class='s'>ролики и география</span>", "Два ролика про 2-спальные квартиры дают 97% просмотров",
    table(["Ролик", "Длина", "Просмотры", "Доля", "Время, ч"], [
        ["Luxury 2BR Apartment in Cyprus", "1:11", "34 321", "55,4%", "23,6"],
        ["2-Bedroom Luxury Apartment", "1:11", "25 598", "41,3%", "109,9"],
        ["Premium Apartments in Germasogeia", "3:53", "1 043", "1,7%", "14,7"],
        ["2-Bedroom Homes in Limassol · 5% VAT (Shorts)", "0:24", "248", "0,4%", "0,2"],
        ["2-Bedroom Homes · Private Presentation (Shorts)", "0:20", "197", "0,3%", "0,2"],
        ["Why Invest in Limassol, Cyprus", "3:12", "123", "0,2%", "0,3"],
    ], num=(1, 2, 3, 4)) + '<div style="height:28px"></div>'
    + table(["Страна", "Просмотры", "Доля", "Время, ч"], [["Кипр", "56 532", "91,2%", "143,3"], ["Россия", "429", "0,7%", "0,9"]], num=(1, 2, 3)),
    plat=YT))

# 13. YouTube subs + plan
S.append(slide("YouTube: <span class='s'>подписки и план</span>", "Откуда приходят подписчики и что делаем в ноябре",
    '<div class="cols" style="grid-template-columns:1.15fr 1fr">'
    + "<div>" + table(["Источник", "Прирост", "Пришло", "Ушло"], [
        ["Реклама на YouTube", "<span class='up'>+1 555</span>", "1 590", "35"],
        ["Страница просмотра", "+11", "14", "3"],
        ["Прочее (чистка аккаунтов YouTube)", "−781", "37", "818"],
        ["Остальные источники", "−95", "9", "104"],
    ], num=(1, 2, 3), tot=["Итого", "+690", "1 650", "960"])
    + '<p class="lead" style="font-size:21px;margin-top:20px;color:var(--muted)">Отписки в категории «Прочее» обычно связаны с удалением неактивных и спам-аккаунтов самим YouTube.</p></div>'
    + '<div class="box g"><h3>План на ноябрь</h3><ol class="num">'
    + "<li>Продвигать «2-Bedroom Luxury Apartment» — лучшее удержание на канале</li>"
    + "<li>Тест рекламы новых Shorts</li>"
    + "<li>Расширение географии: UK, Израиль, Германия, Польша</li>"
    + "<li>Контроль качества подписчиков из рекламы</li></ol></div></div>",
    plat=YT))

# 14. closing
S.append("""<section class="slide closing" style="background-image:url(assets/ph_facade.jpg)">
  <div class="veil"></div><img class="logo" src="assets/logo_gold.png" alt="Sunrock Residences">
</section>""")

OUT.write_text(f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Sunrock — отчёт за октябрь 2026</title><link rel="stylesheet" href="brand.css"><style>{CSS}</style></head>
<body>{"".join(S)}</body></html>""")
print("slides:", len(S))
