# Sunrock Residences

Материалы для клиента Sunrock Residences (Лимассол, Кипр).

- Любой дизайн для Sunrock делаем по `BRAND.md`: цвета, шрифты, логотип, вёрстка.
- Готовые слайды и стили лежат в `brand-decks/`. Общий стиль в `brand.css`, ассеты в `assets/`. PDF собирается так: `node render.mjs <abs path>.html <abs path>.pdf` (Chromium из Playwright).
- Правки по оформлению не должны менять содержание: скриншоты, данные, логотипы платформ и тексты.

## WordPress API

- Доступ к сайту через REST API WordPress: `python3 sunrock/wp/wp.py me | get <path> [query] | post <path> <json>`.
- Ключи только из окружения: `SUNROCK_WP_USER`, `SUNROCK_WP_APP_PASSWORD`. В чат и в репозиторий не писать.
- Изменения на живом сайте (post/delete) делать только по явной просьбе и после показа, что именно меняется.
