/* Тренажёр ЕГЭ (РешуЕГЭ) — статическая версия. Хеш-роутинг, рендер в
   innerHTML, без фреймворков — тот же стиль, что и в selfdev. */

const SUBJECT_NAMES = {
  rus: "Русский язык",
  math_pro: "Математика. Профильный уровень",
};

const root = document.getElementById("root");

/* Данные разбиты по номеру задания (data/<subject>/pos-N.json, плюс
   unplaced.json для заданий без определённой позиции) — один файл на весь
   предмет когда-то доходил до 32 МБ (9000+ заданий по русскому), это долго
   грузить целиком ради одного экрана. index.json — только счётчики
   {"1": 325, ..., "unplaced": 341}, без текстов — им достаточно для
   "Тем"/"Статистики", полные файлы грузятся только когда реально нужны
   (тренировка по конкретной позиции, полный вариант). */

const INDEX_CACHE = {};
const POSITION_CACHE = {};

async function loadIndex(subject) {
  if (INDEX_CACHE[subject]) return INDEX_CACHE[subject];
  const res = await fetch(`data/${subject}/index.json`);
  const index = await res.json();
  INDEX_CACHE[subject] = index;
  return index;
}

async function loadPosition(subject, position) {
  const key = `${subject}/${position}`;
  if (POSITION_CACHE[key]) return POSITION_CACHE[key];
  const file = position === "unplaced" ? "unplaced" : `pos-${position}`;
  const res = await fetch(`data/${subject}/${file}.json`);
  const questions = await res.json();
  POSITION_CACHE[key] = questions;
  return questions;
}

// Для полного варианта нужен хотя бы один вопрос с КАЖДОЙ позиции —
// файлы грузятся параллельно, разово, только по явному действию пользователя.
async function loadAllPositions(subject) {
  const index = await loadIndex(subject);
  const keys = Object.keys(index).filter((k) => k !== "unplaced" && index[k] > 0);
  const lists = await Promise.all(keys.map((k) => loadPosition(subject, k)));
  const byPosition = {};
  keys.forEach((k, i) => (byPosition[k] = lists[i]));
  return byPosition;
}

function structureFor(subject) {
  return EXAM_STRUCTURE[subject] || [];
}

function titleFor(subject, position) {
  const p = structureFor(subject).find((p) => p.position === position);
  return p ? p.title : "";
}

function isEssayPosition(subject, position) {
  const p = structureFor(subject).find((p) => p.position === position);
  return p ? p.isEssay : false;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function navHtml(subject) {
  if (!subject) return "";
  return `
    <nav>
      <a href="#/${subject}/topics">Темы</a>
      <a href="#/${subject}/train">Тренировка</a>
      <a href="#/${subject}/exam">Полный вариант</a>
      <a href="#/mistakes/${subject}">Работа над ошибками</a>
      <a href="#/${subject}/stats">Статистика</a>
    </nav>`;
}

function syncBadge() {
  const state = Sync.getState();
  if (!state.configured) return "";
  const dot = { idle: "⚪", connecting: "🟡", synced: "🟢", error: "🔴" }[state.status] || "⚪";
  return `<a class="sync-link" href="#/sync">${dot} Синхронизация</a>`;
}

function layout(subject, contentHtml) {
  return `
    <header class="topbar">
      <a class="brand" href="#/">Тренажёр ЕГЭ</a>
      ${navHtml(subject)}
      ${syncBadge()}
    </header>
    <main class="container">${contentHtml}</main>
    <p class="hint" style="text-align:center;margin-top:24px">
      Данные и разборы — с сайта <a href="https://ege.sdamgia.ru" target="_blank" rel="noopener">РешуЕГЭ</a> (sdamgia.ru).
      Прогресс хранится в этом браузере (и в облаке по коду — см. «Синхронизация», если подключена).
    </p>`;
}

// ---------- Главная ----------

function renderHome() {
  const cards = Object.keys(SUBJECT_NAMES)
    .map(
      (key) => `
      <a class="card" href="#/${key}/topics">
        <div class="card-title">${esc(SUBJECT_NAMES[key])}</div>
      </a>`
    )
    .join("");
  root.innerHTML = layout(
    null,
    `<h1>Тренажёр ЕГЭ</h1><div class="card-grid">${cards}</div>
     <p style="margin-top:20px"><a href="#/mistakes">Работа над ошибками (все предметы) →</a></p>`
  );
}

// ---------- Темы ----------

async function renderTopics(subject) {
  const index = await loadIndex(subject);
  const attempts = Store.allAttempts(subject);

  // solved считаем по attempts (там теперь хранится position), а не по
  // полным данным — иначе пришлось бы тянуть все 27 файлов только чтобы
  // посчитать, сколько уже решено.
  const solvedByPosition = {};
  for (const a of Object.values(attempts)) {
    if (a.result === "correct" && a.position != null) {
      solvedByPosition[a.position] = (solvedByPosition[a.position] || 0) + 1;
    }
  }

  const unplacedTotal = index.unplaced || 0;

  const rows = structureFor(subject)
    .map((p) => {
      const total = index[String(p.position)] || 0;
      const solved = solvedByPosition[p.position] || 0;
      const cell = total
        ? `${solved} / ${total}`
        : `<span class="hint">нет в базе</span>`;
      const link = total
        ? `<a class="btn-small" href="#/${subject}/train?position=${p.position}">Решать</a>`
        : "";
      return `<tr>
        <td class="topic-code">${p.position}</td>
        <td>${esc(p.title)}</td>
        <td class="topic-progress">${cell}</td>
        <td>${link}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <h1>${esc(SUBJECT_NAMES[subject])}</h1>
    <p class="hint">Задания идут в том же порядке, что и в реальном варианте ЕГЭ.</p>
    <a class="btn" href="#/${subject}/train">Тренировка вперемешку, без выбора №→</a>
    <table class="topics-table">
      <thead><tr><th>№</th><th>Задание</th><th>В базе</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${unplacedTotal ? `<p class="hint">Ещё ${unplacedTotal} заданий без определённого номера — участвуют только в тренировке вперемешку.</p>` : ""}
  `;
  root.innerHTML = layout(subject, html);
}

// ---------- Тренировка ----------

// Без выбранной позиции ("тренировка вперемешку") нужно решить, ИЗ КАКОГО
// файла вообще брать вопрос, не загружая все разом. Берём позицию случайно,
// с вероятностью пропорционально числу заданий в ней — иначе позиция из
// 1000 заданий и позиция из 20 выпадали бы одинаково часто.
function pickRandomPositionKey(index) {
  const entries = Object.entries(index).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const [key, count] of entries) {
    r -= count;
    if (r < 0) return key;
  }
  return entries[entries.length - 1][0];
}

// Возвращает { question, posKey } — posKey нужен отдельно от
// question.exam_position, потому что у "неразмеченных" заданий
// exam_position === null, а файл, откуда их реально взяли, всё равно
// нужно знать (чтобы потом суметь открыть то же задание повторно).
async function pickQuestion(subject, position, qid) {
  if (qid) {
    // "Решить ещё раз" из "Работы над ошибками" — там мы уже когда-то
    // сохранили, в каком файле лежит этот qid (см. Store.setAttempt).
    const attempt = Store.getAttempt(subject, qid);
    const posKey = attempt && attempt.position != null ? String(attempt.position) : null;
    if (posKey == null) return { question: null, posKey: null }; // старая запись без position — не восстановить
    const pool = await loadPosition(subject, posKey);
    return { question: pool.find((q) => String(q.id) === String(qid)) || null, posKey };
  }

  const posKey = position ? String(position) : pickRandomPositionKey(await loadIndex(subject));
  if (posKey == null) return { question: null, posKey: null };
  const pool = await loadPosition(subject, posKey);
  if (!pool.length) return { question: null, posKey };

  const attempts = Store.allAttempts(subject);
  const unsolved = pool.filter((q) => !(attempts[q.id] && attempts[q.id].result === "correct"));
  const finalPool = unsolved.length ? unsolved : pool;
  return { question: finalPool[Math.floor(Math.random() * finalPool.length)], posKey };
}

function questionMetaHtml(subject, q) {
  if (q.exam_position) {
    return `<div class="q-meta">
      <span class="q-id">Задание ${q.exam_position}</span>
      <span class="q-rubric">${esc(titleFor(subject, q.exam_position))}</span>
    </div>`;
  }
  return `<div class="q-meta"><span class="q-id">№ ${esc(q.short_id)}</span></div>`;
}

function answerInputHtml(q) {
  if (q.answer_kind === "essay") {
    return `<textarea class="essay-text" id="essay-input" rows="12" placeholder="Пишите здесь (текст не проверяется автоматически)"></textarea>`;
  }
  return `<input type="text" class="answer-text" id="answer-input" autocomplete="off" placeholder="Введите ответ">`;
}

async function renderTrain(subject, params) {
  const position = params.get("position");
  const qid = params.get("qid");
  const { question: q, posKey } = await pickQuestion(subject, position, qid);

  if (!q) {
    root.innerHTML = layout(
      subject,
      `<h1>Готово!</h1>
       <p>Все задания ${position ? "этого номера" : "в базе"} уже решены верно.</p>
       <a class="btn" href="#/${subject}/topics">К списку заданий</a>`
    );
    return;
  }

  const html = `
    <div class="q-card">
      ${questionMetaHtml(subject, q)}
      <div class="q-stem">${q.stem_html}</div>
      <div id="train-body">
        ${answerInputHtml(q)}
        <div>
          <button class="btn" id="submit-btn">${q.answer_kind === "essay" ? "Показать критерии" : "Проверить"}</button>
        </div>
      </div>
    </div>
  `;
  root.innerHTML = layout(subject, html);

  document.getElementById("submit-btn").addEventListener("click", () => {
    if (q.answer_kind === "essay") {
      showEssayCriteria(subject, q, params, posKey);
    } else {
      const given = document.getElementById("answer-input").value;
      const result = localMatch(given, q.correct_answer) ? "correct" : "incorrect";
      Store.setAttempt(subject, q.id, result, given, posKey);
      showTrainResult(subject, q, result, params, posKey);
    }
  });
}

function showEssayCriteria(subject, q, params, posKey) {
  const essayText = document.getElementById("essay-input").value;
  const criteria =
    subject === "rus"
      ? `<h3>Критерии оценивания</h3>
         <table class="criteria-table">
           ${ESSAY_CRITERIA.map(([code, title, max]) => `<tr><td>${code}</td><td>${esc(title)}</td><td>макс. ${max}</td></tr>`).join("")}
         </table>
         <p class="hint">Источник не проверяет такие задания автоматически. Сверьте своё решение с критериями и оцените честно.</p>`
      : `<p class="hint">У этого задания нет единого рубрика оценивания, применимого к любой задаче этого номера —
         каждое такое задание в реальном экзамене оценивается по своим критериям для конкретного решения.
         Сверьте свой ответ самостоятельно и оцените честно.</p>`;

  const html = `
    <div class="q-card">
      ${questionMetaHtml(subject, q)}
      <div class="q-stem">${q.stem_html}</div>
      <div class="essay-preview">${esc(essayText)}</div>
      ${criteria}
      <div class="self-assess">
        <button class="btn btn-good" id="self-correct">В целом справился</button>
        <button class="btn btn-bad" id="self-incorrect">Не справился</button>
      </div>
    </div>
  `;
  root.innerHTML = layout(subject, html);
  document.getElementById("self-correct").addEventListener("click", () => {
    Store.setAttempt(subject, q.id, "correct", essayText, posKey);
    showTrainResult(subject, q, "correct", params, posKey);
  });
  document.getElementById("self-incorrect").addEventListener("click", () => {
    Store.setAttempt(subject, q.id, "incorrect", essayText, posKey);
    showTrainResult(subject, q, "incorrect", params, posKey);
  });
}

// Используется, когда "Следующее задание" нажато во время прохождения
// "Работы над ошибками" (params.reviewFrom стоит) — вместо повторного показа
// ТОГО ЖЕ вопроса (обычное поведение pickQuestion по qid) ищем следующую
// невыполненную ошибку: сперва в этой же теме, иначе в ближайшей по номеру
// соседней теме (расстояние по порядку в structureFor), иначе в "unplaced".
//
// currentQid обязательно исключать явно: числовые ключи объекта attempts
// перебираются JS-движком по возрастанию id, а НЕ по времени/порядку
// вставки — без исключения "следующая" ошибка внутри той же темы всегда
// оказывалась той с наименьшим id, то есть часто тем же самым вопросом,
// на котором уже стоишь, если именно у него id меньше остальных.
function findNextMistake(subject, fromPosition, currentQid) {
  const attempts = Store.allAttempts(subject);
  const byPosition = {};
  for (const [qid, a] of Object.entries(attempts)) {
    if (a.result !== "incorrect" || a.position == null) continue;
    const key = String(a.position);
    (byPosition[key] = byPosition[key] || []).push(qid);
  }

  const sameTopic = byPosition[String(fromPosition)] || [];
  const sameTopicOther = sameTopic.filter((qid) => String(qid) !== String(currentQid));
  if (sameTopicOther.length) {
    return { position: String(fromPosition), qid: sameTopicOther[0] };
  }
  if (sameTopic.length) {
    // единственная оставшаяся ошибка в теме — это и есть текущий вопрос,
    // повторяем его же (лучше, чем молча перескакивать в другую тему,
    // пока в этой ещё есть что решать)
    return { position: String(fromPosition), qid: sameTopic[0] };
  }

  const order = structureFor(subject).map((p) => String(p.position));
  const fromIdx = order.indexOf(String(fromPosition));
  const otherTopics = Object.keys(byPosition).filter((k) => k !== "unplaced");
  if (otherTopics.length) {
    otherTopics.sort((a, b) => {
      const da = fromIdx === -1 ? 0 : Math.abs(order.indexOf(a) - fromIdx);
      const db = fromIdx === -1 ? 0 : Math.abs(order.indexOf(b) - fromIdx);
      return da - db;
    });
    const nextPos = otherTopics[0];
    return { position: nextPos, qid: byPosition[nextPos][0] };
  }

  if (byPosition["unplaced"] && byPosition["unplaced"].length) {
    return { position: "unplaced", qid: byPosition["unplaced"][0] };
  }

  return null;
}

function showTrainResult(subject, q, result, params, posKey) {
  const resultHtml =
    result === "correct"
      ? `<div class="result result-correct">Верно ✓</div>`
      : `<div class="result result-incorrect">Неверно ✗</div>`;
  const answerHtml =
    q.answer_kind !== "essay" && q.correct_answer
      ? `<div class="correct-answer">Правильный ответ: <strong>${esc(q.correct_answer)}</strong></div>`
      : "";

  const html = `
    <div class="q-card">
      ${questionMetaHtml(subject, q)}
      <div class="q-stem">${q.stem_html}</div>
      ${resultHtml}
      ${answerHtml}
      <button class="btn" id="next-question-btn">Следующее задание →</button>
    </div>
  `;
  root.innerHTML = layout(subject, html);

  // Не ссылка на #/.../train — если хеш не меняется (типичный случай:
  // остаёмся на том же ?position=N, либо следующая ошибка совпадает с
  // текущим qid — единственная оставшаяся в теме), браузер не шлёт
  // hashchange, и клик по <a href> молча ничего не делает. Вызываем рендер
  // напрямую всегда, а URL синхронизируем сами через replaceState.
  document.getElementById("next-question-btn").addEventListener("click", async () => {
    const reviewFrom = params.get("reviewFrom");
    if (reviewFrom != null) {
      const next = findNextMistake(subject, reviewFrom, q.id);
      if (!next) {
        location.hash = `#/mistakes/${subject}`;
        return;
      }
      const newParams = new URLSearchParams({ qid: next.qid, reviewFrom: next.position });
      history.replaceState(null, "", `#/${subject}/train?${newParams.toString()}`);
      await renderTrain(subject, newParams);
      return;
    }
    renderTrain(subject, params);
  });
}

// ---------- Работа над ошибками ----------
//
// Три уровня вместо одного списка: сначала предмет (ошибки бывают в обоих
// сразу), потом номер задания внутри предмета (чтобы не листать сотню
// вперемешку), и только потом сами задания — БЕЗ готового ответа рядом:
// его показывает уже существующий экран тренировки, но только после того,
// как заново попробуешь ответить (см. renderTrain/showTrainResult).

function renderMistakesSubjects() {
  const rows = Object.keys(SUBJECT_NAMES)
    .map((key) => {
      const attempts = Store.allAttempts(key);
      const count = Object.values(attempts).filter((a) => a.result === "incorrect").length;
      const cell = count
        ? `<a class="btn-small" href="#/mistakes/${key}">Смотреть (${count})</a>`
        : `<span class="hint">ошибок нет</span>`;
      return `<tr><td>${esc(SUBJECT_NAMES[key])}</td><td class="topic-progress">${cell}</td></tr>`;
    })
    .join("");

  root.innerHTML = layout(
    null,
    `<h1>Работа над ошибками</h1>
     <p class="hint">Выберите предмет.</p>
     <table class="topics-table"><tbody>${rows}</tbody></table>`
  );
}

function renderMistakesPositions(subject) {
  const attempts = Store.allAttempts(subject);
  const countsByPos = {};
  let unknownCount = 0;
  for (const a of Object.values(attempts)) {
    if (a.result !== "incorrect") continue;
    if (a.position == null) {
      unknownCount++;
      continue;
    }
    const key = String(a.position);
    countsByPos[key] = (countsByPos[key] || 0) + 1;
  }

  const totalMistakes = Object.values(countsByPos).reduce((sum, c) => sum + c, 0);
  if (!totalMistakes) {
    root.innerHTML = layout(
      subject,
      `<h1>Работа над ошибками — ${esc(SUBJECT_NAMES[subject])}</h1>
       <p class="empty">Ошибок пока нет — либо вы всё решаете верно, либо ещё не начинали тренировку.</p>
       <a href="#/mistakes">← Другой предмет</a>`
    );
    return;
  }

  // Только номера, где реально есть ошибки — не весь список позиций
  // предмета с прочерками (их и так видно на экране "Темы").
  const rows = structureFor(subject)
    .filter((p) => countsByPos[String(p.position)])
    .map((p) => {
      const count = countsByPos[String(p.position)];
      return `<tr><td class="topic-code">${p.position}</td><td>${esc(p.title)}</td>
        <td class="topic-progress"><a class="btn-small" href="#/mistakes/${subject}/${p.position}">Смотреть (${count})</a></td></tr>`;
    })
    .join("");

  // "unplaced" — реальный ключ позиции из index.json (задания без номера
  // экзамена, встречаются в "тренировке вперемешку"), не отдельная категория.
  const unplacedCount = countsByPos["unplaced"] || 0;
  const unplacedRow = unplacedCount
    ? `<tr><td class="topic-code">—</td><td>Без определённого номера</td>
        <td class="topic-progress"><a class="btn-small" href="#/mistakes/${subject}/unplaced">Смотреть (${unplacedCount})</a></td></tr>`
    : "";

  root.innerHTML = layout(
    subject,
    `<h1>Работа над ошибками — ${esc(SUBJECT_NAMES[subject])}</h1>
     <p class="hint">Выберите номер задания.</p>
     <a href="#/mistakes">← Другой предмет</a>
     <table class="topics-table">
       <thead><tr><th>№</th><th>Задание</th><th></th></tr></thead>
       <tbody>${rows}${unplacedRow}</tbody>
     </table>
     ${unknownCount ? `<p class="hint">Ещё ${unknownCount} ошибок сохранены без номера задания (старый формат) — их нельзя открыть повторно.</p>` : ""}`
  );
}

async function renderMistakesReview(subject, position) {
  const attempts = Store.allAttempts(subject);
  const mistakeEntries = Object.entries(attempts).filter(
    ([, a]) => a.result === "incorrect" && String(a.position) === String(position)
  );

  if (!mistakeEntries.length) {
    location.hash = `#/mistakes/${subject}`;
    return;
  }

  const pool = await loadPosition(subject, position);
  const byId = Object.fromEntries(pool.map((q) => [String(q.id), q]));

  const cards = mistakeEntries
    .map(([qid, a]) => ({ q: byId[qid], a }))
    .filter((m) => m.q)
    .sort((x, y) => y.a.ts - x.a.ts)
    .map(
      ({ q }) => `
      <div class="q-card">
        ${questionMetaHtml(subject, q)}
        <div class="q-stem">${q.stem_html}</div>
        <a class="btn-small" href="#/${subject}/train?qid=${q.id}&reviewFrom=${position}">Решить ещё раз</a>
      </div>`
    )
    .join("");

  root.innerHTML = layout(
    subject,
    `<h1>Работа над ошибками — задание ${position === "unplaced" ? "без номера" : "№" + position}</h1>
     <p class="hint">Правильный ответ здесь не показывается — нажмите «Решить ещё раз», чтобы попробовать снова.</p>
     <a href="#/mistakes/${subject}">← Все номера с ошибками</a>
     ${cards}`
  );
}

// ---------- Статистика ----------

async function renderStats(subject) {
  // Как и в "Темах" — считаем по index.json (счётчики) + attempts
  // (в которых теперь хранится position), полные файлы не грузим.
  const index = await loadIndex(subject);
  const attempts = Store.allAttempts(subject);

  const attempted = Object.keys(attempts).length;
  const correct = Object.values(attempts).filter((a) => a.result === "correct").length;
  const totalInBase = Object.values(index).reduce((sum, c) => sum + c, 0);

  const solvedByPosition = {};
  for (const a of Object.values(attempts)) {
    if (a.result === "correct" && a.position != null) {
      solvedByPosition[a.position] = (solvedByPosition[a.position] || 0) + 1;
    }
  }

  const bars = structureFor(subject)
    .map((p) => {
      const total = index[String(p.position)] || 0;
      const correctCount = solvedByPosition[p.position] || 0;
      const pct = total ? Math.floor((correctCount / total) * 100) : 0;
      return `<div class="topic-bar-row">
        <div class="topic-bar-label">№${p.position} ${esc(p.title)}</div>
        <div class="topic-bar-track"><div class="topic-bar-fill" style="width:${pct}%"></div></div>
        <div class="topic-bar-value">${correctCount} / ${total}</div>
      </div>`;
    })
    .join("");

  const html = `
    <h1>Статистика — ${esc(SUBJECT_NAMES[subject])}</h1>
    <div class="stat-summary">
      <div class="stat-box"><div class="stat-value">${attempted}</div><div class="stat-label">заданий пройдено</div></div>
      <div class="stat-box"><div class="stat-value">${correct}</div><div class="stat-label">решено верно</div></div>
      <div class="stat-box"><div class="stat-value">${totalInBase}</div><div class="stat-label">всего в базе</div></div>
    </div>
    <h2>По заданиям</h2>
    <div class="topic-bars">${bars}</div>
  `;
  root.innerHTML = layout(subject, html);
}

// ---------- Полный вариант ----------

// exam.positions[qid] запоминает, из какого data/<subject>/pos-N.json файла
// взят каждый вопрос варианта — иначе при возврате к варианту (перезагрузка
// страницы, "Завершить", экран результатов) неоткуда узнать, какие файлы
// вообще грузить, не перебирая все подряд.
async function loadExamQuestions(subject, exam) {
  const posKeys = [...new Set(exam.questionIds.map((id) => exam.positions[id]).filter((p) => p != null))];
  await Promise.all(posKeys.map((p) => loadPosition(subject, p)));
  return exam.questionIds
    .map((id) => {
      const posKey = exam.positions[id];
      const pool = POSITION_CACHE[`${subject}/${posKey}`] || [];
      return pool.find((q) => String(q.id) === String(id));
    })
    .filter(Boolean);
}

async function renderExamStart(subject) {
  const existing = Store.getExam(subject);
  if (existing && !existing.finished) {
    location.hash = `#/${subject}/exam/live`;
    return;
  }
  if (existing && existing.finished) {
    location.hash = `#/${subject}/exam/results`;
    return;
  }

  const html = `
    <h1>Полный вариант — ${esc(SUBJECT_NAMES[subject])}</h1>
    <p>Соберётся один случайный вопрос на каждую позицию 1..${structureFor(subject).length} — как настоящий вариант, а не просто N случайных заданий.</p>
    <label>Время на вариант (минут): <input type="number" id="exam-minutes" value="90" min="10" max="240" style="width:80px"></label>
    <div><button class="btn" id="start-exam-btn">Начать</button></div>
  `;
  root.innerHTML = layout(subject, html);

  document.getElementById("start-exam-btn").addEventListener("click", async () => {
    const minutes = Number(document.getElementById("exam-minutes").value) || 90;
    const byPosition = await loadAllPositions(subject);
    const questionIds = [];
    const positions = {};
    for (const p of structureFor(subject)) {
      const qs = byPosition[String(p.position)];
      if (qs && qs.length) {
        const q = qs[Math.floor(Math.random() * qs.length)];
        questionIds.push(q.id);
        positions[q.id] = String(p.position);
      }
    }
    Store.setExam(subject, {
      questionIds,
      positions,
      startedAt: Date.now(),
      durationSec: minutes * 60,
      answers: {},
      finished: false,
    });
    location.hash = `#/${subject}/exam/live`;
  });
}

let examTimerInterval = null;

async function renderExamLive(subject) {
  const exam = Store.getExam(subject);
  if (!exam || exam.finished) {
    location.hash = `#/${subject}/exam`;
    return;
  }
  const examQuestions = await loadExamQuestions(subject, exam);

  const missing = structureFor(subject)
    .map((p) => p.position)
    .filter((pos) => !examQuestions.some((q) => q.exam_position === pos));

  const cards = examQuestions
    .map(
      (q) => `
      <div class="q-card">
        ${questionMetaHtml(subject, q)}
        <div class="q-stem">${q.stem_html}</div>
        ${answerInputHtml(q).replace('id="answer-input"', `id="exam-input-${q.id}"`).replace('id="essay-input"', `id="exam-input-${q.id}"`)}
      </div>`
    )
    .join("");

  const html = `
    <h1>Полный вариант — ${esc(SUBJECT_NAMES[subject])}</h1>
    <div class="timer" id="exam-timer">--:--</div>
    ${missing.length ? `<p class="hint">В базе не нашлось заданий на позиции: ${missing.join(", ")} — в этом варианте их нет.</p>` : ""}
    ${cards}
    <button class="btn" id="finish-exam-btn">Завершить и проверить</button>
  `;
  root.innerHTML = layout(subject, html);

  document.getElementById("finish-exam-btn").addEventListener("click", () => finishExam(subject, examQuestions));

  const deadline = exam.startedAt + exam.durationSec * 1000;
  function tick() {
    const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const el = document.getElementById("exam-timer");
    if (el) {
      const m = Math.floor(left / 60), s = left % 60;
      el.textContent = `${m}:${s < 10 ? "0" : ""}${s}`;
    }
    if (left <= 0) {
      clearInterval(examTimerInterval);
      finishExam(subject, examQuestions);
    }
  }
  clearInterval(examTimerInterval);
  examTimerInterval = setInterval(tick, 1000);
  tick();
}

function finishExam(subject, examQuestions) {
  clearInterval(examTimerInterval);
  const exam = Store.getExam(subject);
  const answers = {};
  for (const q of examQuestions) {
    const el = document.getElementById(`exam-input-${q.id}`);
    const given = el ? el.value : "";
    if (q.answer_kind === "essay") {
      answers[q.id] = { given, result: null };
    } else {
      answers[q.id] = { given, result: localMatch(given, q.correct_answer) ? "correct" : "incorrect" };
      Store.setAttempt(subject, q.id, answers[q.id].result, given, exam.positions[q.id]);
    }
  }
  exam.answers = answers;
  exam.finished = true;
  Store.setExam(subject, exam);
  location.hash = `#/${subject}/exam/results`;
}

async function renderExamResults(subject) {
  const exam = Store.getExam(subject);
  if (!exam || !exam.finished) {
    location.hash = `#/${subject}/exam`;
    return;
  }
  const examQuestions = await loadExamQuestions(subject, exam);
  const byId = Object.fromEntries(examQuestions.map((q) => [q.id, q]));

  const scored = exam.questionIds
    .map((id) => byId[id])
    .filter((q) => q && q.answer_kind !== "essay");
  const score = scored.filter((q) => exam.answers[q.id] && exam.answers[q.id].result === "correct").length;

  const cards = exam.questionIds
    .map((id) => byId[id])
    .filter(Boolean)
    .map((q) => {
      const a = exam.answers[q.id] || {};
      if (q.answer_kind === "essay") {
        if (a.result) {
          return `<div class="q-card">
            ${questionMetaHtml(subject, q)}
            <div class="q-stem">${q.stem_html}</div>
            <div class="result ${a.result === "correct" ? "result-correct" : "result-incorrect"}">
              ${a.result === "correct" ? "Оценили как выполненное" : "Оценили как невыполненное"}
            </div>
          </div>`;
        }
        const criteria =
          subject === "rus"
            ? `<table class="criteria-table">${ESSAY_CRITERIA.map(([c, t, m]) => `<tr><td>${c}</td><td>${esc(t)}</td><td>макс. ${m}</td></tr>`).join("")}</table>`
            : `<p class="hint">Единого рубрика для этого номера нет — сверьте своё решение самостоятельно.</p>`;
        return `<div class="q-card">
          ${questionMetaHtml(subject, q)}
          <div class="q-stem">${q.stem_html}</div>
          <div class="essay-preview">${esc(a.given || "")}</div>
          ${criteria}
          <div class="self-assess">
            <button class="btn btn-good" data-self-qid="${q.id}" data-self-result="correct">В целом справился</button>
            <button class="btn btn-bad" data-self-qid="${q.id}" data-self-result="incorrect">Не справился</button>
          </div>
        </div>`;
      }
      return `<div class="q-card">
        ${questionMetaHtml(subject, q)}
        <div class="q-stem">${q.stem_html}</div>
        <div class="result ${a.result === "correct" ? "result-correct" : "result-incorrect"}">
          ${a.result === "correct" ? "Верно ✓" : "Неверно ✗"}
        </div>
        ${q.correct_answer ? `<div class="correct-answer">Правильный ответ: <strong>${esc(q.correct_answer)}</strong></div>` : ""}
      </div>`;
    })
    .join("");

  const html = `
    <h1>Результаты варианта</h1>
    <p class="score">Баллы за задания с автопроверкой: <strong>${score} / ${scored.length}</strong></p>
    ${cards}
    <button class="btn" id="new-exam-btn">Начать новый вариант</button>
  `;
  root.innerHTML = layout(subject, html);

  document.querySelectorAll("[data-self-qid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const qid = btn.getAttribute("data-self-qid");
      const result = btn.getAttribute("data-self-result");
      const ex = Store.getExam(subject);
      ex.answers[qid] = ex.answers[qid] || {};
      ex.answers[qid].result = result;
      Store.setAttempt(subject, qid, result, ex.answers[qid].given || "", ex.positions[qid]);
      Store.setExam(subject, ex);
      renderExamResults(subject);
    });
  });

  document.getElementById("new-exam-btn").addEventListener("click", () => {
    Store.clearExam(subject);
    location.hash = `#/${subject}/exam`;
  });
}

// ---------- Синхронизация ----------

const SYNC_STATUS_LABEL = {
  idle: "⚪ Не подключено",
  unavailable: "⚪ Синхронизация не настроена",
  connecting: "🟡 Подключение…",
  synced: "🟢 Синхронизировано",
  error: "🔴 Ошибка соединения — проверьте интернет",
};

function renderSync() {
  // Перерисовываемся сами, когда статус поменяется асинхронно (например,
  // "Подключение…" -> "Синхронизировано" после первого ответа Firestore) —
  // без этого пришлось бы вручную обновлять страницу, чтобы увидеть, что
  // код подключился.
  Sync.setStatusListener(renderSync);
  const state = Sync.getState();

  let body;
  if (!state.configured) {
    body = `<p class="hint">Синхронизация ещё не настроена на этом сайте.</p>`;
  } else if (state.code) {
    body = `
      <label>Код этого пространства — введите такой же на другом устройстве
        <div class="answer-form">
          <input type="text" class="answer-text" id="sync-code-display" readonly value="${esc(Sync.groupCode(state.code))}">
          <button class="btn-small" id="sync-copy-btn">Скопировать</button>
        </div>
      </label>
      <p class="hint">${SYNC_STATUS_LABEL[state.status] || ""}</p>
      <button class="btn btn-bad" id="sync-disconnect-btn">Отключить синхронизацию</button>
    `;
  } else {
    body = `
      <button class="btn" id="sync-create-btn">Создать код на этом устройстве</button>
      <p class="hint" style="margin-top:18px">Или введите код с другого устройства:</p>
      <div class="answer-form">
        <input type="text" class="answer-text" id="sync-code-input" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off">
        <button class="btn-small" id="sync-connect-btn">Подключиться</button>
      </div>
    `;
  }

  root.innerHTML = layout(null, `
    <h1>Синхронизация прогресса</h1>
    <p class="hint">
      Прогресс по умолчанию хранится только в этом браузере. Код ниже — это общий
      секрет, а не логин с паролем: у кого есть код, тот может читать и менять
      данные по нему, поэтому не публикуйте его — используйте только для своих
      устройств.
    </p>
    ${body}
  `);

  const createBtn = document.getElementById("sync-create-btn");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      Sync.createNew();
      renderSync();
    });
  }

  const connectBtn = document.getElementById("sync-connect-btn");
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      const raw = document.getElementById("sync-code-input").value;
      if (!raw.trim()) return;
      if (confirm("Если в облаке по этому коду уже есть данные — они заменят прогресс на этом устройстве. Продолжить?")) {
        Sync.connect(raw);
        renderSync();
      }
    });
  }

  const copyBtn = document.getElementById("sync-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(state.code).then(
        () => alert("Код скопирован"),
        () => alert("Не получилось скопировать — выделите код вручную")
      );
    });
  }

  const disconnectBtn = document.getElementById("sync-disconnect-btn");
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", () => {
      if (confirm("Отключить синхронизацию на этом устройстве? Данные в облаке останутся.")) {
        Sync.disconnect();
        renderSync();
      }
    });
  }
}

// ---------- Роутинг ----------

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path, query] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query || "");
  return { parts, params };
}

async function route() {
  // Экран синхронизации сам себя перерисовывает при смене статуса (см.
  // renderSync) — сбрасываем слушатель при уходе с любого экрана, иначе
  // асинхронный ответ Firestore мог бы перерисовать поверх уже другой
  // открытой страницы (тот же приём, что и с examTimerInterval).
  Sync.setStatusListener(null);

  const { parts, params } = parseHash();
  if (!parts.length) return renderHome();
  if (parts[0] === "sync") return renderSync();

  // Работа над ошибками — отдельная, не привязанная к текущему предмету
  // ветка маршрутов: сначала выбор предмета (#/mistakes), потом номер
  // задания внутри предмета (#/mistakes/<subject>), потом сами задания
  // этого номера (#/mistakes/<subject>/<position>).
  if (parts[0] === "mistakes") {
    const [, subj, pos] = parts;
    if (!subj) return renderMistakesSubjects();
    if (!SUBJECT_NAMES[subj]) return renderHome();
    if (!pos) return renderMistakesPositions(subj);
    return await renderMistakesReview(subj, pos);
  }

  const subject = parts[0];
  if (!SUBJECT_NAMES[subject]) return renderHome();

  const screen = parts[1] || "topics";
  const sub = parts[2];

  try {
    if (screen === "topics") return await renderTopics(subject);
    if (screen === "train") return await renderTrain(subject, params);
    // старая ссылка вида #/<subject>/mistakes — редирект на новую схему
    if (screen === "mistakes") {
      location.hash = `#/mistakes/${subject}`;
      return;
    }
    if (screen === "stats") return await renderStats(subject);
    if (screen === "exam" && !sub) return await renderExamStart(subject);
    if (screen === "exam" && sub === "live") return await renderExamLive(subject);
    if (screen === "exam" && sub === "results") return await renderExamResults(subject);
  } catch (e) {
    console.error(e);
    root.innerHTML = layout(subject, `<p class="hint">Что-то пошло не так: ${esc(String(e))}</p>`);
    return;
  }
  renderHome();
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  Sync.init();
  route();
});
