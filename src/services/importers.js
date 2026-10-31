import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { ensureHardware } from '../db/seed.js';
import { normalizeName, slugify } from './normalize.js';

export const referenceGpus = {
  iris_xe: ['Intel Iris Xe', 'Unknown'], radeon_780m: ['Radeon 780M', 'Mobile'],
  gtx_1650: ['GeForce GTX 1650', 'Desktop'], gtx_1660_super: ['GeForce GTX 1660 SUPER', 'Desktop'],
  rtx_3060: ['GeForce RTX 3060', 'Desktop'], rx_7600: ['Radeon RX 7600', 'Desktop'],
  rtx_4060: ['GeForce RTX 4060', 'Desktop'], rtx_5060: ['GeForce RTX 5060', 'Desktop'],
  rtx_4070: ['GeForce RTX 4070', 'Desktop'], rx_7800_xt: ['Radeon RX 7800 XT', 'Desktop'],
  rtx_5070: ['GeForce RTX 5070', 'Desktop'], rtx_4090: ['GeForce RTX 4090', 'Desktop']
};
export const digest = value => createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const finite = (value, max = 10000) => (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()))) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : null;

function report(name) { return { source: name, inserted: 0, duplicates: 0, skipped: 0, reasons: {}, examples: [] }; }
function skip(result, reason, key) {
  result.skipped++;
  result.reasons[reason] = (result.reasons[reason] || 0) + 1;
  if (result.examples.length < 8) result.examples.push({ key, reason });
}

function sourceId(db, name, url, license, version, type) {
  db.prepare('INSERT INTO benchmark_sources(name,url,license,dataset_version,data_type) VALUES (?,?,?,?,?) ON CONFLICT(name,dataset_version) DO NOTHING')
    .run(name, url, license, version, type);
  return db.prepare('SELECT id FROM benchmark_sources WHERE name=? AND dataset_version=?').get(name, version).id;
}

function gameId(db, { name, key, steam = null, pageUrl }) {
  // Явный, проверенный псевдоним. Roman II не превращаем в 2 для всех игр автоматически.
  if (name === 'Alan Wake II' && steam === null && key.startsWith('pc:')) return db.prepare("SELECT id FROM games WHERE slug='alan-wake-2'").get()?.id ?? createGame();
  const existing = db.prepare('SELECT id FROM games WHERE identity_key=?').get(key);
  if (existing) return existing.id;
  return createGame();
  function createGame() {
    const slug = `${slugify(name).slice(0,100)}-${digest(key).slice(0,12)}`;
    return Number(db.prepare('INSERT INTO games(name,slug,identity_key,steam_appid,page_url) VALUES (?,?,?,?,?)')
      .run(name, slug, key, steam, pageUrl).lastInsertRowid);
  }
}

export function insertBenchmark(db, record) {
  const defaults = { cpu_id: null, ram_gb: null, ray_tracing_mode: null, upscaling_mode: null,
    frame_generation_mode: null, one_percent_low: null, gpu_usage: null, cpu_usage: null,
    measured_at: null, sample_count: null, game_version: null, os: null, driver: null, conditions_json: '{}' };
  const values = { ...defaults, ...record };
  const columns = Object.keys(values);
  // Ключи приходят только из кода импортёров, данные всегда передаются SQL-параметрами.
  return db.prepare(`INSERT INTO benchmarks(${columns.join(',')}) VALUES (${columns.map(key => '@' + key).join(',')})
    ON CONFLICT(source_id,external_key) DO NOTHING`).run(values).changes;
}

export function importPcDataset(db, { gamesCsv, gpusCsv, license, version }) {
  if (!license.includes('Attribution 4.0 International')) throw Error('Не подтверждена лицензия PC Dataset');
  const required = ['name', 'steam_appid', 'page_url', ...Object.keys(referenceGpus).map(key => `fps_1080p_high_${key}`)];
  const rows = parse(gamesCsv, { bom: true, columns: true, skip_empty_lines: true });
  const gpuRows = parse(gpusCsv, { bom: true, columns: true, skip_empty_lines: true });
  if (!rows.length || !required.every(key => Object.hasOwn(rows[0], key))) throw Error('Неизвестные поля games.csv');
  if (!gpuRows.length || !['name','type','g3d_mark','page_url'].every(key => Object.hasOwn(gpuRows[0], key))) throw Error('Неизвестные поля gpus.csv');
  const result = report('PCGameBenchmarks');
  return db.transaction(() => {
    const source = sourceId(db, result.source, 'https://github.com/emilioagustin83/pc-game-fps-dataset', 'CC-BY-4.0', version, 'estimated');
    const gpuIds = new Map();
    for (const gpu of gpuRows) {
      if (!text(gpu.name) || !text(gpu.type)) { skip(result, 'invalid_gpu', gpu.name); continue; }
      gpuIds.set(`${normalizeName(gpu.name)}|${gpu.type}`, ensureHardware(db, 'gpu', gpu.name, gpu.type));
    }
    const references = Object.entries(referenceGpus).map(([key, [name, type]]) => {
      const id = gpuIds.get(`${normalizeName(name)}|${type}`);
      if (!id) throw Error(`Эталонный GPU отсутствует в gpus.csv: ${name}`);
      return [key, id];
    });
    const insert = db.prepare(`INSERT INTO benchmarks(game_id,gpu_id,resolution_width,resolution_height,graphics_preset,
      ray_tracing_mode,upscaling_mode,frame_generation_mode,average_fps,source_id,data_type,external_key,source_url)
      VALUES (?,?,1920,1080,'high','off','off','off',?,?,'estimated',?,?) ON CONFLICT(source_id,external_key) DO NOTHING`);
    for (const row of rows) {
      if (!text(row.name) || !/^https:\/\/pcgamebenchmarks\.com\//.test(row.page_url)) {
        skip(result, 'invalid_game_identity', row.name); continue;
      }
      const steam = /^\d+$/.test(row.steam_appid) ? row.steam_appid : null;
      // Совпадение только по Steam ID или точному URL. Одинаковое название не доказывает одинаковое издание.
      const game = gameId(db, { name: row.name, key: steam ? `steam:${steam}` : `pc:${row.page_url}`, steam, pageUrl: row.page_url });
      const fpsCap=finite(row.engine_fps_cap);
      if(fpsCap>0)db.prepare('UPDATE games SET fps_cap=? WHERE id=?').run(fpsCap,game);
      for (const [key, gpu] of references) {
        const fps = finite(row[`fps_1080p_high_${key}`]);
        if (fps === null || fps <= 0) { skip(result, 'missing_or_invalid_fps', `${row.name}/${key}`); continue; }
        const changed = insert.run(game, gpu, fps, source, `${row.page_url}|${key}`, row.page_url).changes;
        result[changed ? 'inserted' : 'duplicates']++;
      }
    }
    result.datasetVersion = version;
    return result;
  })();
}

export function importOpenGpu(db, document) {
  if (document?._license?.name !== 'CC-BY-4.0' || document?.metadata?.license?.id !== 'CC-BY-4.0') throw Error('Не подтверждена лицензия Open GPU Benchmarks');
  if (document.metadata.synthetic_data !== false || !Array.isArray(document.records) || !Array.isArray(document.games)) throw Error('Некорректный dashboard.json');
  // Проверена схема 0.20. Изменение формата требует проверки адаптера, а не молчаливой догадки.
  if (document.metadata.schema_version !== '0.20') throw Error('Неподдерживаемая схема Open GPU Benchmarks');
  const result = report('Open GPU Benchmarks');
  const version = `${document.metadata.commit || 'snapshot'}:${digest(JSON.stringify(document))}`;
  const resolutions = { '1080p': [1920,1080], '1440p': [2560,1440], '4K': [3840,2160] };
  return db.transaction(() => {
    const source = sourceId(db, result.source, 'https://opengpubenchmarks.com/api/v1/dashboard.json', 'CC-BY-4.0', version, 'measured');
    for (const row of document.records) {
      if (row.game_type !== 'game' || row.synthetic !== false) { skip(result, 'not_a_real_game', row.id); continue; }
      // Сводные группы могут объединять разные версии/режимы. Без отдельных запусков их не импортируем.
      if (row.run_count !== 1 || row.implementations?.length !== 1) { skip(result, 'aggregated_runs_not_imported', row.id); continue; }
      const dimensions = resolutions[row.resolution];
      const fps = finite(row.avg_fps);
      if (!text(row.id) || !text(row.gpu_name) || !text(row.game) || !text(row.game_id) || !dimensions || !text(row.graphics_preset) || !fps) { skip(result, 'invalid_record', row.id); continue; }
      const implementation = row.implementations[0];
      // Если сводка и описание запуска противоречат друг другу, результат небезопасен для сравнения.
      const keys = ['cpu','memory_gb','driver','os','upscaling','overclocked'];
      if (keys.some(key => row[key] != null && implementation[key] != null && row[key] !== implementation[key])) { skip(result, 'conflicting_conditions', row.id); continue; }
      if (row.os !== 'windows' || row.overclocked !== false) { skip(result, 'unsupported_os_or_overclock', row.id); continue; }
      const cpuName = text(row.cpu);
      const cpu = cpuName ? ensureHardware(db, 'cpu', cpuName) : null;
      const ram = Number.isInteger(row.memory_gb) && row.memory_gb > 0 ? row.memory_gb : null;
      const knownGame = row.game_id === 'cyberpunk_2077' ? db.prepare("SELECT id FROM games WHERE identity_key='steam:1091500'").get()?.id : null;
      const game = knownGame ?? gameId(db, { name: row.game, key: `open:${row.game_id}`, pageUrl: 'https://opengpubenchmarks.com/' });
      const gpu = ensureHardware(db, 'gpu', row.gpu_name, row.form_factor || 'Unknown');
      const preset = row.graphics_preset.toLowerCase();
      // RT хранится отдельно только если явно указан. Обычный High не доказывает режим RT.
      const rt = preset.startsWith('ray tracing: ') ? preset.slice('ray tracing: '.length) : null;
      const fg = row.frame_generation === false ? 'off' : row.frame_generation === true ? 'on' : text(row.frame_generation)?.toLowerCase() ?? null;
      const upscaling = text(row.upscaling)?.toLowerCase() ?? null;
      const changed = insertBenchmark(db, { game_id: game, gpu_id: gpu, cpu_id: cpu, ram_gb: ram,
        resolution_width: dimensions[0], resolution_height: dimensions[1], graphics_preset: preset,
        ray_tracing_mode: rt, upscaling_mode: upscaling, frame_generation_mode: fg,
        average_fps: fps, one_percent_low: finite(row.p1_low), source_id: source, data_type: 'measured',
        external_key: row.id, source_url: 'https://opengpubenchmarks.com/api/v1/dashboard.json',
        measured_at: /^\d{4}-\d{2}-\d{2}$/.test(row.date || '') ? row.date : null,
        sample_count: 1, game_version: text(row.game_version), os: text(row.os), driver: text(row.driver),
        conditions_json: JSON.stringify({ sourceFile: row.source_file, testbench: row.testbench_source_id,
          memoryType: row.memory_type, memoryChannels: row.memory_channels, graphicsApi: row.graphics_api,
          captureMethod: row.capture_method, proofLevel: row.proof_level, sourceCategory: row.source,
          osDetail: row.os_detail, implementation, creditName: row.credit_name,
          creditUrl: row.credit_url, creditSourceUrl: row.credit_source_url }) });
      result[changed ? 'inserted' : 'duplicates']++;
    }
    result.datasetVersion = version;
    return result;
  })();
}
