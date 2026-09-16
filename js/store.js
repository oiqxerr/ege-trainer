/* Прогресс пользователя — только localStorage, ничего никуда не отправляется.
   По той же причине, что и в selfdev: приватность и ноль инфраструктуры для
   базового сценария. Firestore (если понадобится синхронизация между
   устройствами по коду) подключается поверх этого же формата отдельно. */

const Store = (() => {
  const KEY = "ege_progress_v1";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { subjects: {} };
    } catch {
      return { subjects: {} };
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* приватный режим / диск переполнен — прогресс просто не сохранится в этой сессии */
    }
  }

  function subjectData(data, subject) {
    if (!data.subjects[subject]) {
      data.subjects[subject] = { attempts: {}, exam: null };
    }
    return data.subjects[subject];
  }

  return {
    getAttempt(subject, qid) {
      const data = load();
      return subjectData(data, subject).attempts[qid] || null;
    },

    setAttempt(subject, qid, result, given, position) {
      const data = load();
      const existing = subjectData(data, subject).attempts[qid];
      subjectData(data, subject).attempts[qid] = {
        result,
        given,
        ts: Date.now(),
        // position нужен, чтобы потом (в "Работе над ошибками") знать, какой
        // из data/<subject>/pos-N.json файлов открыть за текстом задания —
        // данные теперь разбиты по номеру, а не одним большим файлом.
        // Сохраняем позицию, даже если её сейчас не передали (например,
        // самооценка сочинения в результатах варианта не всегда знает
        // позицию под рукой) — берём её из уже существующей записи.
        position: position !== undefined ? position : existing && existing.position,
      };
      save(data);
    },

    allAttempts(subject) {
      const data = load();
      return subjectData(data, subject).attempts;
    },

    getExam(subject) {
      const data = load();
      return subjectData(data, subject).exam;
    },

    setExam(subject, exam) {
      const data = load();
      subjectData(data, subject).exam = exam;
      save(data);
    },

    clearExam(subject) {
      this.setExam(subject, null);
    },

    exportAll() {
      return load();
    },

    importAll(data) {
      save(data);
    },
  };
})();
