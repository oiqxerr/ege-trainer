/* Проверка ответа — портировано из checker.local_match (Python, ege-trainer).
   РешуЕГЭ отдаёт готовый ответ прямо в данных (см. data/*.json), поэтому
   сверка — локальное сравнение строк, без единого сетевого запроса. */

function normalizeAnswer(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, "");
}

function isDigitsOnly(s) {
  return s.length > 0 && /^[0-9]+$/.test(s);
}

// Расстояние Левenштейна — сколько правок (вставка/удаление/замена символа)
// отделяет одну строку от другой.
function levenshtein(a, b) {
  const dp = Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

// Порог для нечёткого сравнения слов/фраз (не цифр). Ловит частые случаи
// вроде "не даст в обиду" / "не даст ЕЁ в обиду" — та же самая идиома,
// просто с вставленным по контексту местоимением (грамматически нормально
// для русского языка, источник просто не перечисляет все варианты вставки).
// 0.85 — намеренно консервативно: пропускает опечатку/вставку одного слова,
// но не спутает существенно разные ответы.
const FUZZY_THRESHOLD = 0.85;

function oneMatch(given, correct) {
  if (!correct) return false;
  if (given === correct) return true;
  if (isDigitsOnly(given) && isDigitsOnly(correct)) {
    // цифровой ответ в любом порядке тоже верный (часть заданий принимает
    // любой порядок цифр, часть — нет; без знания конкретного задания это
    // разумный компромисс — не наказывать за порядок, а не наоборот).
    // Для цифр нечёткое сравнение НЕ включаем: "123" и "124" отличаются
    // на 1 символ, но это два разных ответа, а не опечатка/вставка.
    return given.split("").sort().join("") === correct.split("").sort().join("");
  }
  const dist = levenshtein(given, correct);
  const similarity = 1 - dist / Math.max(given.length, correct.length);
  return similarity >= FUZZY_THRESHOLD;
}

// РешуЕГЭ иногда даёт несколько допустимых вариантов через "|" (например
// "23|32" — порядок пары не важен для конкретно этого задания)
function localMatch(given, correct) {
  const g = normalizeAnswer(given);
  return (correct || "").split("|").some((c) => oneMatch(g, normalizeAnswer(c)));
}
