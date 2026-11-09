# Sunrock: журнал SEO-изменений на сайте

## 04.11.2026 — sitemap, canonical, robots, дубли мета-тегов

Причина проблем: вставки кода в Elementor → Custom Code с жёстко прописанными title/description/canonical главной (на всех страницах) плюс одновременная работа Yoast и AIOSEO.

Сделано (резервные копии лежали в `sunrock/wp/backups/` только в сессии, в репозиторий не коммитятся):
- Elementor Custom Code → **черновик**: 597 «Header tags» (canonical на главную, title «Resindences», «49 apartments», OG главной на всех страницах), 2203/2204/2205 (дубли title для 2/3/4-спальных). Остальные вставки (Hotjar, Profitbase, CSS, анимации, schema Apartment 1969/2016/2017) не тронуты.
- AIOSEO: исключена из карты страница `/test-button/` (id 4669); выключена RSS-карта; удалены 14 ошибочных правил robots.txt (включая `Disallow: /ru/`, которое закрыло бы всю русскую версию).
- AIOSEO title: «Resindences» → «Residences» на 6 страницах (625, 1402, 1487, 1522, 1737, RU 2846).
- Из Yoast в AIOSEO перенесены уникальные title/description 9 статей (EN 5474, 5118, 4553, 4541, 4529; RU 5473, 4554, 4540, 4530).
- Yoast SEO деактивирован (пользователем вручную), не удалён.

Результат проверки (307 URL из sitemap): все 200, один self-canonical, один title, один description, без noindex, XML валиден. robots.txt: стандартные правила + одна строка `Sitemap: https://sunrockresidences.com/sitemap.xml`. Старые адреса `sitemap_index.xml` и `wp-sitemap.xml` редиректят на `sitemap.xml`.

## Осталось
- hreflang: из ~140 пар статей EN↔RU в WPML связаны только 4 → у 272 статей нет hreflang. Связать переводы.
- Страницы `/sunrock-residences/` (106) и `/ru/резиденции-sunrock/` — похожи на старые копии главной; решить (оставить/убрать из карты/301).
- Сниппет 1969 «2 bedroom schema» выводит второй og:title на 2-спальной странице — почистить OG-теги в сниппетах 1969/2016/2017.
- H1 (нет у 279 статей и большинства страниц), alt у ~3,7 тыс. картинок, длинные title (>60) и description (>160).
- Кеш Breeze/Varnish держит страницы до 30 дней: после правок нажимать Breeze → Purge All Cache.

## 09.11.2026 — опечатка в H1, метаданные и H1 основных страниц

- Доступ к сайту переведён на network secret среды (Basic), прокси подставляет его сам.
- H1: «Sunrock Resindences» → «Residences» в heading-виджетах страниц 1402, 1487, 1522, RU 2846. После правки `_elementor_data` нужен сброс кеша Elementor (`DELETE elementor/v1/cache`), иначе Elementor отдаёт старую копию блока.
- Метаданные AIOSEO (title ≤ 60, description ≤ 155) для 23 основных страниц EN/RU — тексты согласованы, лежат в `sunrock/wp/meta_plan.py`.
- H1: на страницах 2/3/4 спален EN и RU длинная SEO-строка заменена на короткий заголовок с запросом (3-спальные: H2 → H1). На главных EN/RU надпись «SUNROCK RESIDENCES» переведена из H1 в div — теперь один H1.
- «Склеенные» H1 (LOCATED INTHE HILLS) — ложная тревога: в коде `<br>`, исправлять не нужно.
- Подготовлен `sunrock/wpml_post_pairs.csv` — 131 пара статей EN↔RU для связывания переводов в WPML (через API нельзя).
- Вывод hreflang в WPML пока НЕ включён (09.11 проверено: в <head> hreflang нет).

Осталось по этапам 1–3: 301 с `/sunrock-residences/` и `/ru/резиденции-sunrock/` (нет инструмента редиректов — нужен плагин Redirection), связка переводов статей, длинные title/description статей блога.
