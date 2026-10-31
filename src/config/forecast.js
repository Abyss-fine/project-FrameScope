// Учебные допущения FrameScope v1. Не калиброваны на независимой тестовой выборке.
// Коррекция = вес целевого условия / вес исходного; RT/DLSS/FG не моделируются.
export const forecastConfig = Object.freeze({
  version: 'heuristic-v1',
  resolutions: { '1920x1080': 1, '2560x1440': 0.72, '3840x2160': 0.40 },
  presets: { low: 1.35, medium: 1.15, high: 1, ultra: 0.85 },
  sourceCeilings: { PCGameBenchmarks: 360 },
  roundingStep: 5
});
