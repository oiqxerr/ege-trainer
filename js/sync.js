/* Синхронизация прогресса между устройствами через Firestore — тот же
   приём, что и в selfdev (github.com/oiqxerr/selfdev): у "пространства"
   есть код (случайная строка), кто знает код — тот может читать и писать
   данные по нему. Это НЕ авторизация, а общий секрет вроде ссылки на
   документ "у кого есть ссылка": удобно для личного использования на
   нескольких устройствах, но код нельзя публиковать где попало.

   Работает и без этого файла — если Firebase не настроен (см.
   firebase-config.js), everything ведёт себя как раньше: только
   localStorage, никакой сети. */

const Sync = (() => {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // без 0/O/1/I/L — легче читать и печатать
  const CODE_KEY = "ege.syncCode";
  const DEVICE_KEY = "ege.deviceId";

  let db = null;
  let unsub = null;
  let code = null;
  let deviceId = null;
  let applyingRemote = false;
  let pushTimer = null;
  let status = "idle"; // idle | unavailable | connecting | synced | error
  let statusListener = null;

  function randomCode(len = 20) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  }

  function groupCode(c) {
    return (c || "").match(/.{1,4}/g)?.join("-") || "";
  }

  function normalizeCode(raw) {
    return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  function configured() {
    return (
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.apiKey !== "ВСТАВЬ_СЮДА"
    );
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomCode(10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function notify() {
    if (statusListener) statusListener();
  }

  /* ---------- жизненный цикл ---------- */

  function init() {
    if (!configured()) {
      status = "unavailable";
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    deviceId = getDeviceId();

    // Любое локальное изменение прогресса (тренировка, экзамен, самооценка
    // сочинения) идёт через Store.save() — подписка здесь ловит их все разом,
    // без необходимости звать Sync из каждого места в app.js отдельно.
    Store.onChange(() => schedulePush());

    const saved = localStorage.getItem(CODE_KEY);
    if (saved) connect(saved);
  }

  function connect(rawCode) {
    if (!db) return;
    const c = normalizeCode(rawCode);
    if (c.length < 16) {
      alert("Код слишком короткий — проверьте, что скопировали его целиком");
      return;
    }

    if (unsub) unsub();
    code = c;
    localStorage.setItem(CODE_KEY, code);
    status = "connecting";
    notify();

    unsub = db.collection("syncSpaces").doc(code).onSnapshot(
      (snap) => {
        if (!snap.exists) {
          // новый код, в облаке по нему ещё ничего нет — кладём туда то,
          // что уже накопилось на этом устройстве, как стартовую точку
          pushNow();
          return;
        }
        const remote = snap.data();
        if (remote.updatedBy !== deviceId) {
          applyingRemote = true;
          Store.importAll(remote.payload);
          applyingRemote = false;
        }
        status = "synced";
        notify();
      },
      (err) => {
        console.error("Sync: ошибка подписки", err);
        status = "error";
        notify();
      }
    );

    notify();
  }

  function createNew() {
    connect(randomCode());
  }

  function disconnect() {
    if (unsub) unsub();
    unsub = null;
    code = null;
    localStorage.removeItem(CODE_KEY);
    status = "idle";
    notify();
  }

  function schedulePush() {
    if (!code || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 600);
  }

  function pushNow() {
    if (!code || !db) return;
    db.collection("syncSpaces")
      .doc(code)
      .set({
        payload: Store.exportAll(),
        updatedBy: deviceId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        status = "synced";
        notify();
      })
      .catch((err) => {
        console.error("Sync: ошибка записи", err);
        status = "error";
        notify();
      });
  }

  /* ---------- для экрана настроек в app.js ---------- */

  function getState() {
    return { configured: configured(), code, status };
  }

  // Один слот, не список: app.js вызывает это при рендере экрана
  // синхронизации (чтобы перерисовать себя, когда статус поменяется сам,
  // напр. connecting -> synced) и обнуляет при уходе с экрана — иначе
  // асинхронный snapshot после ухода со страницы мог бы неожиданно
  // перерисовать поверх уже другого открытого экрана.
  function setStatusListener(cb) {
    statusListener = cb;
  }

  return { init, connect, createNew, disconnect, getState, setStatusListener, groupCode };
})();
