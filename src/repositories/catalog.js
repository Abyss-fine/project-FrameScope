import { normalizeName } from '../services/normalize.js';

export function gameDto(row) {
  return { id: row.id, slug: row.slug, title: row.name, genre: row.genre ?? 'Жанр не указан',
    description: row.description ?? 'Описание пока не добавлено. Открой страницу источника для информации об игре.',
    released: row.release_date, releaseLabel: 'Проверенная дата релиза',
    image: row.image_url ?? 'assets/images/city-library.svg', source: row.page_url,
    edition: row.edition_note, number: String(row.id).padStart(2, '0'), featured: Boolean(row.featured) };
}

export function findGame(db, idOrSlug) {
  const row = /^\d+$/.test(String(idOrSlug))
    ? db.prepare('SELECT * FROM games WHERE id=?').get(Number(idOrSlug))
    : db.prepare('SELECT * FROM games WHERE slug=?').get(idOrSlug);
  return row ? gameDto(row) : null;
}

export function getCatalog(db, { search = '', genre = '', featured = false, limit = 24, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (search) { where.push('instr(normalize_name(name), ?) > 0'); params.push(normalizeName(search)); }
  if (genre) { where.push('coalesce(genre, ?) = ?'); params.push('Жанр не указан', genre); }
  if (featured) where.push('featured=1');
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = db.prepare('SELECT count(*) AS total FROM games' + clause).get(...params).total;
  const items = db.prepare('SELECT * FROM games' + clause + ' ORDER BY featured DESC, id LIMIT ? OFFSET ?').all(...params, limit, offset).map(gameDto);
  const genres = db.prepare("SELECT DISTINCT coalesce(genre, 'Жанр не указан') AS genre FROM games ORDER BY genre").all().map(row => row.genre);
  return { items, total, limit, offset, genres };
}

export function getHardware(db, kind, { search = '', limit = 2000, offset = 0 } = {}) {
  const table = kind === 'cpus' ? 'processors' : 'graphics_cards';
  const tokens = normalizeName(search).split(' ').filter(Boolean);
  const where = tokens.length ? ' WHERE ' + tokens.map(() => 'instr(normalize_name(model), ?) > 0').join(' AND ') : '';
  return db.prepare(`SELECT id,manufacturer,model${kind === 'gpus' ? ',form_factor' : ''},
    EXISTS(SELECT 1 FROM benchmarks WHERE ${kind === 'gpus' ? 'gpu_id' : 'cpu_id'}=${table}.id) AS has_benchmarks
    FROM ${table}${where} ORDER BY has_benchmarks DESC, model, id LIMIT ? OFFSET ?`).all(...tokens, limit, offset).map(row => ({ ...row, hasBenchmarks: Boolean(row.has_benchmarks) }));
}
