# Тренажёр ЕГЭ — статическая версия (РешуЕГЭ)

Публичная версия: **https://oiqxerr.github.io/ege-trainer/**
(зеркало на Firebase Hosting: https://ege-trainer-app.web.app — та же сборка,
поддерживается на случай проблем с GitHub Pages)

Полностью статический сайт (HTML/CSS/JS, без сервера) — данные и разборы с
[РешуЕГЭ](https://ege.sdamgia.ru) (sdamgia.ru), ответ уже известен из
источника, проверка происходит прямо в браузере. Прогресс — в
`localStorage`; по желанию можно подключить синхронизацию между устройствами
по коду (см. раздел "Синхронизация прогресса" ниже) — без этого ничего
никуда не отправляется.

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
  store.js             — прогресс в localStorage (+ onChange-подписка для sync.js)
  sync.js              — синхронизация прогресса между устройствами по коду (Firestore)
  firebase-config.js   — публичные ключи веб-SDK проекта ege-trainer-app
  checker.js           — сравнение ответа (портировано из checker.local_match)
  exam-structure.js    — № задания → название (сгенерировано из exam_structure.py)
  essay-criteria.js    — критерии K1-K12 для сочинения (только рус. язык)
firestore.rules         — правила доступа к синхронизации (см. ниже)
data/
  rus/                 — задания по русскому, разбиты по номеру (pos-1.json … pos-27.json,
                          unplaced.json, index.json — счётчики), т.к. одним файлом было 32 МБ
  math_pro/            — та же раскладка для профильной математики
```

## Как обновить данные

Данные не выкачиваются на лету — если решуЕГЭ добавит новые задания или
понадобится досыпать позиции, экспорт делается из уже наполненной SQLite
базы `ege-trainer/`:

```bash
cd ege-trainer/app
python -c "
import json, os
from db import get_conn
for subject in ['reshuege_rus', 'reshuege_math_pro']:
    with get_conn() as c:
        rows = c.execute('SELECT id, short_id, exam_position, answer_kind, stem_html, correct_answer FROM questions WHERE subject_key=? ORDER BY id', (subject,)).fetchall()
    data = [dict(r) for r in rows]
    name = subject.replace('reshuege_', '')

    # один файл на весь предмет когда-то дорос до 32 МБ (9000+ заданий по
    # русскому) — разбиваем по номеру задания, чтобы экран грузил только
    # то, что реально нужно (см. js/app.js: loadIndex/loadPosition)
    out_dir = f'../../ege-static/data/{name}'
    os.makedirs(out_dir, exist_ok=True)
    by_pos = {}
    for q in data:
        key = str(q['exam_position']) if q['exam_position'] is not None else 'unplaced'
        by_pos.setdefault(key, []).append(q)

    index = {}
    for key, qs in by_pos.items():
        fname = 'unplaced.json' if key == 'unplaced' else f'pos-{key}.json'
        json.dump(qs, open(f'{out_dir}/{fname}', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index[key] = len(qs)
    json.dump(index, open(f'{out_dir}/index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
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

Если менялись `firestore.rules` — задеплоить их отдельно (хостинг их не
трогает):

```bash
firebase deploy --only firestore:rules
```

## Синхронизация прогресса

Прогресс по умолчанию — только `localStorage` этого браузера. По желанию
можно подключить синхронизацию между устройствами через Firestore, той же
схемой, что и в [selfdev](https://github.com/oiqxerr/selfdev)
(`js/sync.js`): на экране «Синхронизация» (ссылка в шапке сайта) можно
создать код на одном устройстве и ввести тот же код на другом — весь объект
прогресса (`Store.exportAll()`) читается/пишется в один документ Firestore
`syncSpaces/{код}`, изменения на любом подключённом устройстве долетают до
остальных вживую (`onSnapshot`), без отдельного сервера.

**Это не авторизация, а общий секрет** (как ссылка на гугл-документ) — у
кого есть код, тот может и читать, и переписывать данные по нему. Код — 20
случайных символов из 32-символьного алфавита (без похожих друг на друга
0/O/1/I/L), поэтому подобрать его перебором нечего и думать, но публиковать
код (скриншотом, в чате всем) не стоит. `firestore.rules` разрешает
get/create/update только по конкретному id документа и запрещает `list`
целиком — то есть даже зная, что коллекция существует, перечислить чужие
коды через API нельзя.

Инфраструктура — тот же Firebase-проект `ege-trainer-app`, что и для
Hosting (Firestore в Spark-плане бесплатен без привязки карты, в отличие от
Cloud Run/Cloud Functions — см. ограничения ниже). Настройка с нуля на новом
проекте:

```bash
firebase apps:create web "ege-static" --project ege-trainer-app       # регистрирует веб-приложение
firebase apps:sdkconfig WEB <app-id> --project ege-trainer-app        # берём отсюда значения в js/firebase-config.js
firebase firestore:databases:create "(default)" --location=eur3 --project ege-trainer-app
firebase deploy --only firestore:rules
```

`firestore.googleapis.com` иногда нужно включить вручную один раз через
консоль (`console.developers.google.com/apis/api/firestore.googleapis.com`)
— Firebase CLI не может сделать это сам без работающего `gcloud`.

## Известные ограничения (в дополнение к общим из ege-trainer/README.md)

- **Синхронизация — общий секрет, не аккаунт** (подробности выше) — код
  нужно хранить так же аккуратно, как пароль, потерянный код означает
  потерянный доступ к облачной копии (локальная копия в браузере никуда не
  денется).
- **Без подключения синхронизации прогресс живёт только в этом браузере.**
  Очистка данных сайта или новое устройство без кода — начинать заново.
- **ФИПИ-часть не включена.** Живая проверка ответов через solve.php
  требует Python-сервер, который делает запрос от имени пользователя — это
  принципиально не работает из браузера напрямую (CORS). Если понадобится
  вернуть ФИПИ — это Cloud Run (или похожий сервис), не статический хостинг,
  и Google потребует привязать карту (даже для бесплатного тарифа) — уже
  обсуждали и сознательно отказались от этого варианта.
