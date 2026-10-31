# REST API FrameScope v0.1

Базовый адрес по умолчанию: `http://localhost:3000/api`. JSON в UTF-8. Ошибка: `{ "code": "...", "message": "..." }`. POST принимает только application/json, не более 16 KiB. Идентификаторы получай из API, а не из названий устройств.

| Метод и маршрут | Результат |
| --- | --- |
| GET /api/health | status, database, version |
| GET /api/games | items, total, limit, offset, genres |
| GET /api/games/:id | одна игра; также поддерживается старый slug |
| GET /api/games/:id/settings?gpuId=... | проверенный профиль настроек игры и GPU |
| GET /api/hardware/cpus | items: id, manufacturer, model, hasBenchmarks |
| GET /api/hardware/gpus | items: id, manufacturer, model, form_factor, hasBenchmarks |
| GET /api/benchmarks/availability | items доступных сочетаний и total/limit/offset |
| POST /api/benchmarks/estimate | найденная запись или недостаточность данных |

## Каталог

`GET /api/games?search=Control&genre=Экшен&limit=24&offset=0`

`search` — подстрока без учёта регистра и вариантов апострофов; `genre` — точная строка из genres; `featured=true` — исходные десять игр. limit от 1 до 20000 (по умолчанию 24), offset от 0 до 1000000. Поиск, жанр и featured применяются вместе.

Игра имеет числовой id, slug, title, genre, description, released, releaseLabel, image, source, edition, number, featured. В SQLite name соответствует DTO title. Незнакомые данные обозначаются как отсутствующие, а не вычисляются.

`GET /api/games/control` и `GET /api/games/2` выбирают одну исходную игру в свежей базе. Неизвестная игра — 404 GAME_NOT_FOUND. Неправильные типы параметров и неизвестные query-ключи — 400.

## Доступность

`GET /api/benchmarks/availability?gameId=1&gpuId=1382&limit=100&offset=0`

Фильтры gameId/gpuId необязательные. limit от 1 до 1000; по умолчанию 100. Каждый элемент включает gameId/game, gpuId/gpu, cpuId/cpu, ramGb, resolution, graphicsPreset, rayTracingMode, upscalingMode, frameGenerationMode, dataType, gameVersion, os.

Это перечень имеющихся условий, а не подтверждение совместимости произвольного CPU. NULL CPU/RAM не позволяет применить измерение к любому ПК. В текущей форме панель альтернатив удалена; маршрут сохранён для технического просмотра.

## Подбор

Обязательные поля: gameId; cpuId или cpuName; gpuId или gpuName; ramGb (1–2048); resolution (например, 1920x1080); graphicsPreset. ID должны быть положительными целыми числами. Ручное название — строка 2–120 символов без управляющих символов. Одновременно ID и название одной модели передавать нельзя. Ручной ввод не создаёт запись и возвращает 404 MANUAL_HARDWARE_NO_DATA без FPS, даже если текст похож на существующую модель.

Форма использует новый формат upscalingTechnology + upscalingQuality. Пример: `"upscalingTechnology":"dlss","upscalingQuality":"quality"`; с Native — `"upscalingTechnology":"off","upscalingQuality":null`. Старый явный upscalingMode тоже поддержан, но смешивать оба формата нельзя. Допустимые технологии/качество/RT/FG нового формата проверяются по профилю игры и GPU. Строки версий FSR и XeSS не объединяются.

Следующий пример — сохранённый технический запрос к метаданным замера, а не набор пунктов пользовательской формы. NULL/unknown не предлагаются пользователю как настройки:

```json
{
  "gameId": 1,
  "cpuId": 7,
  "gpuId": 1382,
  "ramGb": 64,
  "resolution": "1920x1080",
  "graphicsPreset": "low",
  "rayTracingMode": "unknown",
  "upscalingMode": "fsr 2.1 auto",
  "frameGenerationMode": "off"
}
```

Это фактически проверенный запрос к текущей базе: Cyberpunk 2077, Ryzen 9 9950X3D, RTX 5080 Founders Edition, 64 ГБ. Режим RT неизвестен в источнике и явно указан как unknown, а не off. Опционально можно добавить `gameVersion: "2.31"`, `os: "windows"`.

Ответ **HTTP 200**, сокращён только для чтения:

```json
{
  "benchmarkId": 209125,
  "dataType": "measured",
  "label": "Реальный бенчмарк",
  "averageFps": 209,
  "onePercentLow": 149.48,
  "gpuUsage": null,
  "cpuUsage": null,
  "cpuConsidered": true,
  "ramConsidered": true,
  "source": {
    "name": "Open GPU Benchmarks",
    "url": "https://opengpubenchmarks.com/api/v1/dashboard.json",
    "datasetUrl": "https://opengpubenchmarks.com/api/v1/dashboard.json",
    "license": "CC-BY-4.0",
    "datasetVersion": "fc94e56089f3:6c32bd314f311a9cf0924b7b350fe0301deab3e163b70a82edbe5d84db8bfdf4"
  },
  "limitations": [
    "Это измерение конкретной тестовой системы, а не гарантия FPS на твоём компьютере. Остальные условия теста указаны ниже; временной ряд отсутствует.",
    "Источник не сообщает режим «RT». Выбрано явно неизвестное условие; отключённым этот режим не считается.",
    "Версия игры в запросе не задана. Версия источника: 2.31."
  ],
  "timeSeries": null
}
```

Полный ответ также содержит conditions (CPU/GPU, RAM, разрешение, режимы, дата, версия, драйвер, ОС и details), matchedRecords. Для модели dataType=estimated, label=«Ориентировочный прогноз», cpuConsidered/ramConsidered=false. 1% Low и нагрузка остаются NULL, если источник их не сообщает.

### Поля прогноза

Успешный ответ также содержит:

| Поле | Значение |
| --- | --- |
| resultType | measured или estimated; соответствует dataType |
| method | measured, dataset-estimate или heuristic |
| confidence | high, medium, low; качественная категория, не вероятность |
| explanation | основание; для heuristic — исходный FPS и коэффициенты |
| sourceName / sourceUrl | атрибуция и ссылка; у heuristic название включает FrameScope |
| basis | benchmarkId, исходные dataType, averageFps, resolution, graphicsPreset, gameVersion, measuredAt |
| adjustments | у heuristic: version, factors {resolution,preset}, limits; иначе null |

`conditions` показывает запрошенные разрешение/пресет; исходные условия находятся в `basis`. У пересчитанного результата `onePercentLow`, `gpuUsage`, `cpuUsage` всегда null. `timeSeries` остаётся null. Оценки округляются; исходный FPS сохранён в basis. Реальный замер моделью не округляется.

При отсутствии точной записи используется ближайшая основа той же игры/GPU с совпадающими известными режимами. CPU/RAM/ОС для измеренной основы должны совпасть. Пересчитываются только разрешение и обычный пресет. NULL-режимы для эвристики запрещены. [Коэффициенты и ограничения](FORECAST.md).

`GET /games/:id/settings?gpuId=...` сохраняет профиль технологий и добавляет `analysis` с rayTracing, upscaling, frameGeneration и combinations. Это подмножество режимов с полностью описанными записями для игры/GPU. Форма использует его и скрывает поля, где доступен только off. `combinations` перечисляет совместные режимы; произвольное смешение отдельных доступных опций может не иметь основы. Поддержка технологии игрой сама по себе не обещает FPS.

### Семантика режимов и версии

- `off` — выключено; строка режима, например `fsr 2.1 auto`, — именно этот режим.
- `null` или `unknown` — явно неизвестное состояние; оно совпадает только с NULL записи, не с off. Результат сопровождается предупреждением.
- Если режим не передан, API возвращает 404 SETTINGS_REQUIRED с missingSettings. Пропуск не считается off и не совпадает автоматически с NULL источника. Форма отправляет явные настройки.
- `gameVersion` — сохранённый необязательный фильтр технического API. В пользовательской форме поля версии больше нет; версия источника показана в результате, версия установленной игры не определяется.
- `os` — windows по умолчанию; допустим также linux. Для измерения ОС должна совпасть. Модель не моделирует влияние ОС.

### Если совпадения нет

HTTP **404**:

```json
{
  "code": "INSUFFICIENT_DATA",
  "message": "Недостаточно данных даже для ориентировочного прогноза. Для выбранных игры, GPU или графических режимов нет подходящей основы.",
  "alternatives": [],
  "alternativesTotal": 0,
  "assumptions": []
}
```

alternatives может содержать до 12 имеющихся сочетаний для той же игры/GPU. Больше — через availability. Это ошибка после неудачного точного поиска и поиска основы для эвристики. FPS в ней отсутствует; перенос на другую видеокарту не выполняется.

## Коды

- 200 — успешный запрос.
- 400 INVALID_REQUEST / INVALID_QUERY / UNKNOWN_ENTITY / INVALID_JSON — неправильные данные.
- 404 GAME_NOT_FOUND / INSUFFICIENT_DATA / API_NOT_FOUND — отсутствующая игра, запись или маршрут.
- 404 MANUAL_HARDWARE_NO_DATA / SETTINGS_REQUIRED — нет подтверждённого ID ручной модели или не указаны обязательные настройки.
- 400 UNSUPPORTED_SETTINGS — сочетание технологии, качества, RT или FG не подтверждено справочником игры/GPU.
- 413 BODY_TOO_LARGE — JSON больше 16 KiB.
- 415 JSON_REQUIRED — неверный Content-Type POST-запроса.
- 500 INTERNAL_ERROR — внутренняя ошибка, без SQL/стека в ответе.

## Проверка через PowerShell

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod 'http://localhost:3000/api/games?search=Control'
$payload = @{
  gameId = 1
  cpuId = 7
  gpuId = 1382
  ramGb = 64
  resolution = '1920x1080'
  graphicsPreset = 'low'
  rayTracingMode = 'unknown'
  upscalingMode = 'fsr 2.1 auto'
  frameGenerationMode = 'off'
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/benchmarks/estimate -Method Post -ContentType 'application/json' -Body $payload
```

ID из примера относятся к текущему снимку/свежей базе и могут отличаться после других импортов: сверяй их со списками API. При вызове через JavaScript используй fetch с тем же origin; CORS для постороннего Live Server не включён.
