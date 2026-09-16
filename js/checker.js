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

function oneMatch(given, correct) {
  if (!correct) return false;
  if (given === correct) return true;
  // цифровой ответ в любом порядке тоже верный (часть заданий принимает
  // любой порядок цифр, часть — нет; без знания конкретного задания это
  // разумный компромисс — не наказывать за порядок, а не наоборот)
  return isDigitsOnly(given) && isDigitsOnly(correct) && given.split("").sort().join("") === correct.split("").sort().join("");
}

// РешуЕГЭ иногда даёт несколько допустимых вариантов через "|" (например
// "23|32" — порядок пары не важен для конкретно этого задания)
function localMatch(given, correct) {
  const g = normalizeAnswer(given);
  return (correct || "").split("|").some((c) => oneMatch(g, normalizeAnswer(c)));
}
