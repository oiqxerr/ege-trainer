# Тренажёр ЕГЭ — статическая версия (РешуЕГЭ)

Публичная версия: **https://oiqxerr.github.io/ege-trainer/**
(зеркало на Firebase Hosting: https://ege-trainer-app.web.app — та же сборка,
поддерживается на случай проблем с GitHub Pages)

Полностью статический сайт (HTML/CSS/JS, без сервера) — данные и разборы с
[РешуЕГЭ](https://ege.sdamgia.ru) (sdamgia.ru), ответ уже известен из
источника, проверка происходит прямо в браузере. Прогресс — в
`localStorage`, ничего никуда не отправляется.

Это urезанная версия `ege-trainer/` (там же — полная версия с ФИПИ и живой
проверкой ответов через solve.php, но она требует Python-сервер и не может
быть статическим сайтом; подробности — почему именно так и что перенесено —
см. `ege-trainer/README.md`, раздел "Два источника заданий").

## Структура

```
index.html            — единственная HTML-страница (весь UI рендерится в JS)
css/style.css          — стили (взято как есть из ege-trainer/app/static/)
js/
  app.js               — роутинг (хеш-навигация) и рендер экранов
  store.js             — прогресс в localStorage
  checker.js           — сравнение ответа (портировано из checker.local_match)
  exam-structure.js    — № задания → название (сгенерировано из exam_structure.py)
  essay-criteria.js    — критерии K1-K12 для сочинения (только рус. язык)
data/
  rus.json             — 1152 задания по русскому
  math_pro.json        — 1022 задания по профильной математике
```

## Как обновить данные

Данные не выкачиваются на лету — если решуЕГЭ добавит новые задания или
понадобится досыпать позиции, экспорт делается из уже наполненной SQLite
базы `ege-trainer/`:

```bash
cd ege-trainer/app
python -c "
import json
from db import get_conn
for subject in ['reshuege_rus', 'reshuege_math_pro']:
    with get_conn() as c:
        rows = c.execute('SELECT id, short_id, exam_position, answer_kind, stem_html, correct_answer FROM questions WHERE subject_key=? ORDER BY id', (subject,)).fetchall()
    data = [dict(r) for r in rows]
    name = subject.replace('reshuege_', '')
    json.dump(data, open(f'../../ege-static/data/{name}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
"
```

Если поменяется `exam_structure.py` или критерии сочинения в `main.py` —
перегенерировать `js/exam-structure.js` и `js/essay-criteria.js` тем же
способом (см. историю разработки — использовался прямой импорт модулей).

## Как задеплоить

Основной способ — просто запушить в `main`, GitHub Pages подхватывает
автоматически (ветка `main`, корень репозитория — настроено в Settings →
Pages):

```bash
git add -A
git commit -m "..."
git push
```

Обновление доходит за 1-2 минуты. Зеркало на Firebase (не обязательно,
но поддерживается) обновляется отдельной командой:

```bash
firebase deploy --only hosting
```

Требует `firebase login` (аккаунт griaznoffiv@gmail.com, проект
`ege-trainer-app` в `.firebaserc`) и установленный Firebase CLI
(`npm install -g firebase-tools`).

## Известные ограничения (в дополнение к общим из ege-trainer/README.md)

- **Прогресс живёт только в этом браузере.** Очистка данных сайта или новое
  устройство — начинать заново. В selfdev для этого использовалась
  синхронизация через Firestore по коду — здесь такая же схема **не
  реализована**, только локальное хранение. Если понадобится — можно
  добавить по аналогии с `selfdev/js/sync.js`.
- **Никакой авторизации нет** — ссылка публичная, любой, кто её узнает,
  может пользоваться сайтом (со своим отдельным прогрессом в своём браузере).
- **ФИПИ-часть не включена.** Живая проверка ответов через solve.php
  требует Python-сервер, который делает запрос от имени пользователя — это
  принципиально не работает из браузера напрямую (CORS). Если понадобится
  вернуть ФИПИ — это Cloud Run (или похожий сервис), не статический хостинг,
  и Google потребует привязать карту (даже для бесплатного тарифа) — уже
  обсуждали и сознательно отказались от этого варианта.
