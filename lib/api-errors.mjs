const messages = {
  coordinates: ["Latitude must be between −90° and 90°. East longitude must be between −180° and 180°.", "Широта должна быть от −90° до 90°, долгота — от −180° до 180°."],
  receiverHeight: ['Equipment height must be between 0 and 100 m.','Высота аппаратуры должна быть от 0 до 100 м.'],
  terrainBusy: ['Terrain requests are busy. Try again shortly.','Загрузка рельефа занята. Повторите запрос чуть позже.'],
  terrainUnavailable: ['DEM could not be loaded. Check the connection and retry. Terrain visibility was not calculated.','Не удалось загрузить DEM. Проверьте соединение и повторите запрос. Видимость по рельефу не рассчитана.'],
  pole: ["Choose a point slightly away from the pole.", "Выберите точку немного в стороне от полюса."],
  startUtc: ["Enter a UTC time to the nearest minute, from 1972 to 2099.", "Укажите время UTC с точностью до минуты, с 1972 по 2099 год."],
  period: ["Use a period of 1 to {maxHours} whole hours and a supported step that gives at most 2,001 samples.", "Укажите период от 1 до {maxHours} целых часов и допустимый шаг, дающий до 2001 отсчёта."],
  horizonsFormat: ["Horizons returned an error or changed its response format.", "Horizons вернул ошибку или изменил формат ответа."],
  missingTable: ["The Horizons response has no ephemeris table.", "В ответе Horizons нет таблицы эфемерид."],
  observerMismatch: ["The Horizons table has unexpected columns, target, or observer.", "Horizons вернул таблицу с неожиданными колонками, целью или наблюдателем."],
  invalidSample: ["The Horizons table contains a missing or invalid sample.", "В таблице Horizons есть отсутствующий или неверный отсчёт."],
  skyFormat: ["Horizons returned an unexpected format for globe directions.", "Horizons вернул неожиданный формат направлений для глобуса."],
  invalidDirection: ["The Horizons table contains an invalid globe direction.", "В таблице Horizons есть неверное направление для глобуса."],
  incomplete: ["The Horizons time series is incomplete. A visibility window could not be calculated.", "Временной ряд Horizons неполный. Окна по нему не рассчитаны."],
  horizonsHttp: ["Horizons returned HTTP {status}.", "Horizons вернул HTTP {status}."],
  offline: ["Offline mode uses saved requests. Open the Odysseus or Athena demo.", "Офлайн доступны сохранённые запросы. Откройте демо Odysseus или Athena."],
  busy: ["The Horizons queue is full. Try again shortly.", "Очередь Horizons заполнена. Повторите запрос чуть позже."],
  horizonsUnavailable: ['JPL Horizons is unavailable after automatic retries. Retry the calculation or use a saved result below.', 'JPL Horizons недоступен после автоматических повторных попыток. Повторите расчёт или воспользуйтесь сохранённой таблицей ниже.'],
  horizonsTimeout: ['JPL Horizons did not respond in time after automatic retries. Retry the calculation; saved tables remain available below.', 'JPL Horizons не ответил вовремя после автоматических повторных попыток. Повторите расчёт; сохранённые таблицы доступны ниже.'],
  method: ["Use GET.", "Используйте GET."],
  route: ["This route does not exist.", "Такого маршрута нет."],
  file: ["File not found.", "Файл не найден."],
  url: ["Invalid URL.", "Неверный URL."],
  server: ["The local server encountered an error.", "Ошибка локального сервера."],
};

export function apiErrorMessage(code, params = {}, language = "en") {
  if (!Object.hasOwn(messages, code)) return null;
  return messages[code][language === "ru" ? 1 : 0].replace(/\{(\w+)\}/g, (_, name) => params[name]);
}
