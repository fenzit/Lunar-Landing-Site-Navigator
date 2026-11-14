const messages = {
  moon: ["Moon", "Луна"],
  sceneScale: ["Scene scale", "Масштаб сцены"],
  wholeSystem: ["Whole system", "Вся система"],
  toMoon: ["To Moon", "К Луне"],
  animateBodies: ["Animate bodies", "Анимация тел"],
  animationNote: ["Illustrative rotation · speeds not to scale", "Обзорное вращение · скорости условные"],
  title: ["LunarPilot — Lunar Landing Navigator", "LunarPilot — навигатор посадки"],
  brand: ["LunarPilot, main screen", "LunarPilot, интерфейс"],
  language: ["Interface language", "Язык интерфейса"],
  analysis: ["Analysis settings", "Параметры анализа"],
  landingSite: ["Landing site", "Место посадки"],
  heroFirst: ["At the edge", "На краю"],
  heroLast: ["of silence.", "тишины."],
  intro: ["How long will sunlight and a direct view of Earth last after landing?", "Сколько света и прямой видимости Земли останется после посадки?"],
  conditions: ["Conditions", "Условия"],
  landingConditions: ["Landing conditions", "Условия посадки"],
  environment: ["ENVIRONMENT", "ОКРУЖЕНИЕ"],
  horizon: ["0° HORIZON", "ГОРИЗОНТ 0°"],
  site: ["Site", "Площадка"],
  pickSite: ["Pick on Moon", "На Луне"],
  random: ["Random site", "Случайная"],
  randomSite: ["Random site", "Случайная точка"],
  selectedSite: ["Selected site", "Выбранная точка"],
  sun: ["Sun", "Солнце"],
  earth: ["Earth", "Земля"],
  visibilityNote: ["Geometric visibility · terrain excluded", "Геометрическая видимость · рельеф не учтён"],
  calculateSite: ["Analyze this site", "Рассчитать для точки"],
  windowResult: ["Visibility window result", "Расчёт окна"],
  remaining: ["WINDOW REMAINING", "ОСТАЛОСЬ В ОКНЕ"],
  required: ["REQUIRED", "НУЖНО"],
  operations: ["INITIAL OPERATIONS", "ПЕРВЫЕ ОПЕРАЦИИ"],
  hours: ["h", "ч"],
  minutes: ["min", "мин"],
  view: ["VIEW", "ТОЧКА ЗРЕНИЯ"],
  viewSelect: ["View", "Точка зрения"],
  globe: ["Globe", "Глобус"],
  ground: ["Surface view", "У поверхности"],
  chart: ["Chart", "График"],
  globeCaption: ["GLOBE · LOLA RELIEF ×3", "ГЛОБУС · РЕЛЬЕФ LOLA ×3"],
  groundCaption: ["0° HORIZON · SCHEMATIC", "ГОРИЗОНТ 0° · СХЕМА"],
  chartCaption: ["ELEVATION CHART · UTC", "ГРАФИК ВЫСОТ · UTC"],
  play: ["Play timeline", "Прокрутить время"],
  pause: ["Pause", "Пауза"],
  reset: ["Back to period start", "В начало периода"],
  time: ["Landing time, UTC", "Время посадки, UTC"],
  latitude: ["Latitude, °", "Широта, °"],
  longitude: ["East longitude, °", "Восточная долгота, °"],
  startUtc: ["Start, UTC", "Начало, UTC"],
  period: ["Period, h (up to 30 days)", "Период, ч (до 30 суток)"],
  requiredInput: ["Hours needed for operations", "Нужно для операций, ч"],
  calculate: ["Calculate", "Рассчитать"],
  demo: ["Open saved scenario", "Открыть сохранённый сценарий"],
  compare: ["Compare with another site", "Сравнить с другой площадкой"],
  hideComparison: ["Hide comparison", "Скрыть сравнение"],
  next: ["Go to next viable start", "К ближайшему старту"],
  sources: ["Sources and model limits", "Источники и границы модели"],
  model: ["The 0° threshold applies to the centers of the Sun and Earth. The model estimates geometric visibility. Local shadows, eclipses, power generation, and radio link performance are outside its scope. The globe shows terrain at the resolution of its source map.", "Порог 0° применяется к центрам Солнца и Земли. Модель учитывает геометрическую видимость. В неё не входят местные тени, затмения, выработка энергии и параметры радиолинии. Подробности рельефа ниже масштаба карты на глобусе не отображаются."],
  moon3d: ["3D Moon", "Трёхмерная Луна"],
  aim: ["Aim camera", "Наведение камеры"],
  aimSun: ["Aim camera at the Sun", "Повернуть камеру к Солнцу"],
  aimEarth: ["Aim camera at Earth", "Повернуть камеру к Земле"],
  faceSun: ["Face Sun", "К Солнцу"],
  faceEarth: ["Face Earth", "К Земле"],
  rotate: ["Orbit camera", "Облёт камеры"],
  slope: ["Slopes", "Уклоны"],
  slopeSource: ["Max slope · SLDEM2015 overview", "Макс. уклон · обзор SLDEM2015"],
  slopeNoData: ["Uncolored areas lack data", "Без цвета — нет данных"],
  chartLabel: ["Sun and Earth elevation in degrees over UTC, with visibility and viable start bands", "Высота Солнца и Земли в градусах по UTC, полосы видимости и допустимых стартов"],
  both: ["Both", "Оба"],
  start: ["Start", "Старт"],
  saved: ["Saved data", "Сохранённые данные"],
  cached: ["Local cache", "Локальный кэш"],
  live: ["Live JPL data", "Запрос к JPL"],
  notToScale: ["not to scale", "масштаб условный"],
  skyUnavailable: ["JPL directions unavailable · illustrative lighting", "Направления JPL недоступны · обзорная подсветка"],
  skyLoading: ["Loading directions from JPL…", "Загружаем направления JPL…"],
  globeDirections: ["Globe directions", "Направления для глобуса"],
  skyPeriodUnavailable: ["Globe directions are unavailable for this period.", "Для выбранного периода направления глобуса недоступны."],
  above: ["above 0°", "выше 0°"],
  below: ["below 0°", "ниже 0°"],
  onHorizon: ["at 0°", "на 0°"],
  azimuth: ["Azimuth", "Азимут"],
  enough: ["ENOUGH TIME", "ХВАТАЕТ"],
  unconfirmed: ["UNCONFIRMED", "НЕ ПОДТВЕРЖДЕНО"],
  insufficient: ["NOT ENOUGH TIME", "НЕ ХВАТАЕТ"],
  noStart: ["No viable start in the remaining period.", "Подходящего старта в оставшемся периоде нет."],
  nextStart: ["Next viable start ≈ {time}.", "Ближайший старт ≈ {time}."],
  coverage: ["Visibility is confirmed through the end of the analysis period.", "Видимость подтверждена до конца расчётного периода."],
  windowSufficient: ["The window covers the required time.", "Окно покрывает нужное время."],
  summary: ["Total shared visibility {total}. Longest window in the period {longest}.", "Общее время видимости {total}. Самое длинное окно в периоде {longest}."],
  compareSummary: ["{name} · total shared visibility {total}.", "{name}: общее время {total}."],
  retrieved: ["retrieved {time}.", "получено {time}."],
  ephemerisLoading: ["Loading ephemerides…", "Загружаем эфемериды…"],
  picked: ["Site selected. Choose “Analyze this site” to continue.", "Точка выбрана. Нажмите «Рассчитать для точки»."],
  randomPicked: ["Random site selected. Choose “Analyze this site” to continue.", "Случайная точка выбрана. Нажмите «Рассчитать для точки»."],
  pickHint: ["Click the globe or enter coordinates in Analysis settings.", "Нажмите на глобус или введите координаты в параметрах анализа."],
  no3d: ["3D is unavailable. The chart and manual coordinate entry are available.", "3D недоступно. График и ручной выбор координат работают."],
  comparing: ["Loading {name} on the same UTC timeline…", "Загружаем {name} на ту же шкалу UTC…"],
  compared: ["Comparison with {name} · {source}", "Сравнение с {name} · {source}"],
  loadFailed: ["The application could not load. {error}", "Приложение не загрузилось. {error}"],
  requestFailed: ["Could not complete the request. Check the local server and try again.", "Не удалось выполнить запрос. Проверьте локальный сервер и повторите попытку."],
  httpError: ["The server returned HTTP {status}.", "Сервер вернул HTTP {status}."],
  sceneLabel: ["3D scene. On the globe, use arrow keys to rotate, plus and minus to zoom, and Enter to pick a site.", "3D-сцена. На глобусе используйте стрелки для вращения, плюс и минус для зума, Enter для выбора точки."],
  behind: ["behind", "позади"],
  globeLoading: ["Loading the LRO and LOLA globe…", "Загружаем глобус LRO и LOLA…"],
  globeUnavailable: ["The globe is unavailable. Enter coordinates in Analysis settings.", "Глобус недоступен. Можно выбрать координаты в параметрах анализа."],
  landerNote: ["Schematic lander and object sizes", "Условная модель аппарата и размеры объектов"],
  slopeUnavailable: ["The slope texture is unavailable.", "Текстура уклонов недоступна."],
};

const storageKey = "lunarpilot-language";
export let language = "en";
try {
  if (localStorage.getItem(storageKey) === "ru") language = "ru";
} catch {
  // The switcher still works for the current page if storage is unavailable.
}

export function setLanguage(value) {
  language = value === "ru" ? "ru" : "en";
  try { localStorage.setItem(storageKey, language); } catch { /* Storage is optional. */ }
}

export function t(key, values = {}) {
  return messages[key][language === "ru" ? 1 : 0].replace(/\{(\w+)\}/g, (_, name) => values[name]);
}

export function localizePage() {
  document.documentElement.lang = language;
  document.title = t("title");
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const [attribute, key] of [["aria-label", "data-i18n-label"], ["title", "data-i18n-title"]]) {
    for (const element of document.querySelectorAll(`[${key}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(key)));
    }
  }
  for (const button of document.querySelectorAll("[data-language]")) {
    button.setAttribute("aria-pressed", String(button.dataset.language === language));
  }
}
