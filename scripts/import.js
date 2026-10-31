import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { root } from '../src/config.js';
import { importPcDataset, importOpenGpu, digest } from '../src/services/importers.js';

const raw = resolve(root, 'data/raw');
const offline = process.argv.includes('--offline');
await mkdir(raw, { recursive: true });

async function download(name, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'FrameScope-educational/0.1' } });
  if (!response.ok) throw Error(`HTTP ${response.status}: ${url}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 64 * 1024 * 1024) throw Error('Источник превысил ограничение 64 MiB');
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  const path = resolve(raw, name);
  await writeFile(path + '.download', content);
  await rename(path + '.download', path);
  return content.toString('utf8');
}
const read = name => readFile(resolve(raw, name), 'utf8');
const db = openDatabase();
const reports = [];
try {
  seedDatabase(db);
  // Источники независимы: отказ одного не мешает импорту другого.
  try {
    if (!offline) {
      const commit = JSON.parse(await download('pc-commit.json', 'https://api.github.com/repos/emilioagustin83/pc-game-fps-dataset/commits/main')).sha;
      if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Некорректный Git commit');
      const base = `https://raw.githubusercontent.com/emilioagustin83/pc-game-fps-dataset/${commit}/`;
      await download('pc-games.csv', base + 'data/games.csv');
      await download('pc-gpus.csv', base + 'data/gpus.csv');
      await download('pc-license.txt', base + 'LICENSE');
      await download('pc-readme.md', base + 'README.md');
    }
    const gamesCsv = await read('pc-games.csv');
    const gpusCsv = await read('pc-gpus.csv');
    reports.push(importPcDataset(db, { gamesCsv, gpusCsv, license: await read('pc-license.txt'), version: 'sha256:' + digest(gamesCsv + '\n' + gpusCsv) }));
  } catch (error) { reports.push({ source: 'PCGameBenchmarks', error: error.message }); }
  try {
    const json = offline ? await read('open-dashboard.json') : await download('open-dashboard.json', 'https://opengpubenchmarks.com/api/v1/dashboard.json');
    reports.push(importOpenGpu(db, JSON.parse(json)));
  } catch (error) { reports.push({ source: 'Open GPU Benchmarks', error: error.message }); }
  const totals = {
    games: db.prepare('SELECT count(*) AS count FROM games').get().count,
    gpus: db.prepare('SELECT count(*) AS count FROM graphics_cards').get().count,
    benchmarks: db.prepare('SELECT data_type, count(*) AS count FROM benchmarks GROUP BY data_type').all(),
    featured: db.prepare('SELECT g.name, count(b.id) AS benchmarks FROM games g LEFT JOIN benchmarks b ON b.game_id=g.id WHERE g.featured=1 GROUP BY g.id').all()
  };
  const report = { importedAt: new Date().toISOString(), offline, reports, totals };
  await writeFile(resolve(root, 'data/import-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (reports.some(item => item.error)) process.exitCode = 1;
} finally { db.close(); }
