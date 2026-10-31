# Проверенный импорт Backend v0.1

Проверка: **31 октября 2026 года**, Node.js 24.21.0, better-sqlite3 12.11.1, Express 5.3.0, csv-parse 6.2.1. Это зафиксированный результат данного этапа, а не обещание неизменности внешних источников.

| Источник | Сохранено | Пропущено |
| --- | ---: | ---: |
| PCGameBenchmarks | 209124 estimated | 0 |
| Open GPU Benchmarks | 27 measured | 4 |
| Всего | **209151** | **4** |

Игры: **17427**. GPU в справочнике: **1382**. CPU: **7** (6 исходных + Ryzen 9 9950X3D из замеров). GPU с FPS: **13**.

Повторная команда import:offline: **0 новых**, **209151 дубль пропущен**, число записей не изменилось. Данные не удалялись. Отчёт CLI после каждого запуска сохраняется в data/import-report.json.

## Версии

PC Dataset получен по commit `79825655595ee10334908c831fe2cb41dd923703`; идентификатор содержимого CSV:

```text
sha256:66cc882b2d960addbdda17ef26284e1814df822a42a0eb248420f91dc60de6d0
```

Open GPU Benchmarks: схема 0.20, release 1.13.0.0, generated_at 2026-10-27T16:54:38.141259+00:00:

```text
fc94e56089f3:6c32bd314f311a9cf0924b7b350fe0301deab3e163b70a82edbe5d84db8bfdf4
```

Оба источника заявляют CC BY 4.0. Ссылки, ограничения и изменения: [DATA_SOURCES.md](../DATA_SOURCES.md).

## Покрытие исходных игр

| Игра | Оценки | Замеры |
| --- | ---: | ---: |
| Cyberpunk 2077 | 12 | 27 |
| Control | 12 | 0 |
| Alan Wake 2 | 12 | 0 |
| Red Dead Redemption 2 | 12 | 0 |
| Grand Theft Auto V | 12 | 0 |
| Hogwarts Legacy | 12 | 0 |
| Baldur’s Gate 3 | 12 | 0 |
| Elden Ring | 12 | 0 |
| Forza Horizon 5 | 12 | 0 |
| Counter-Strike 2 | 12 | 0 |

CSV ограничен 1920×1080 / High / RT off / апскейлинг off / генерация кадров off. Реальные замеры имеют отдельные разрешения, пресеты и режимы; перечень доступен через API.

GPU с записями: AMD Radeon RX 7800 XT, GeForce GTX 1650, GeForce RTX 4090, GeForce RTX 5060, GeForce RTX 5070, GeForce RTX 5080 Founders Edition, Intel Iris Xe, NVIDIA GeForce GTX 1660 SUPER, NVIDIA GeForce RTX 3060, NVIDIA GeForce RTX 4060, NVIDIA GeForce RTX 4070, Radeon 780M, Radeon RX 7600. Это исходные варианты, включая тип устройства; ноутбучная версия не приравнивается к настольной.

## Почему пропущены четыре строки Open GPU

Три записи — многозапусковые сводки: 1440p / High, 4K / Steam Deck и 4K / Ray Tracing: Ultra. При отсутствии отдельных запусков невозможно подтвердить однородность всех условий и версий; сводки не импортируются.

Ещё одна — синтетический OpenBenchmarker Neon Flythrough. Это не результат компьютерной игры. Импортёр проверяет game_type, а не только synthetic.

## Пример найденного измерения

Cyberpunk 2077, GeForce RTX 5080 Founders Edition, AMD Ryzen 9 9950X3D 16-Core Processor, 64 ГБ, 1920x1080, low, FSR 2.1 Auto, FG off, RT **неизвестно**, игра 2.31. Средний FPS: **209**, 1% Low: **149.48**; загрузка GPU/CPU неизвестна, временного ряда нет. Это замер одной системы, не гарантия для другого ПК.

[Полный запрос и формат ответа](API.md). Источник: [Open GPU Benchmarks JSON](https://opengpubenchmarks.com/api/v1/dashboard.json), исходный файл `data/official/rtx_5080_16gb_fe/result_20261013_cyberpunk_2077.yaml`.

Тестовые фикстуры из tests/backend.test.mjs используют только отдельные :memory: базы. Рабочая база содержит исключительно импортированные записи указанных источников.

Проверка приложения: 22 автоматических теста, 47 браузерных сценариев, integrity_check=ok, foreign_key_check — 0 нарушений. Через обычный npm run dev выполнен HTTP-запрос к localhost:3000 и получено 209 FPS / 149.48 1% Low. Подробный HTTP-ответ локально сохранён в test-artifacts/example-http.json; скриншоты — backend-1440.png и backend-375.png. Сервер после проверки остановлен.
