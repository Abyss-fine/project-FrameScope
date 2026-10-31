import { games } from '../../public/assets/js/data/games.js';
import { hardware } from '../../public/assets/js/data/hardware.js';
import { hardwareIdentity, manufacturer } from '../services/normalize.js';

const steamIds = ['1091500', '870780', null, '1174180', '271590', '990080', '1086940', '1245620', '1551360', '730'];

export function ensureHardware(db, kind, model, formFactor = '') {
  const table = kind === 'cpu' ? 'processors' : 'graphics_cards';
  const key = hardwareIdentity(model, kind, formFactor);
  const existing = db.prepare(`SELECT id FROM ${table} WHERE identity_key = ?`).get(key);
  if (existing) return existing.id;
  const columns = kind === 'gpu' ? ', form_factor' : '';
  const placeholder = kind === 'gpu' ? ', ?' : '';
  const params = [manufacturer(model), model, key];
  if (kind === 'gpu') params.push(formFactor || null);
  return Number(db.prepare(`INSERT INTO ${table}(manufacturer, model, identity_key${columns}) VALUES (?, ?, ?${placeholder})`).run(...params).lastInsertRowid);
}

export function seedDatabase(db) {
  db.transaction(() => {
    const insert = db.prepare(`INSERT INTO games(name,slug,identity_key,steam_appid,genre,description,release_date,image_url,page_url,edition_note,featured)
      VALUES (@name,@slug,@key,@steam,@genre,@description,@released,@image,@source,@edition,1) ON CONFLICT(identity_key) DO NOTHING`);
    games.forEach((game, index) => insert.run({ name: game.title, slug: game.id,
      key: steamIds[index] ? `steam:${steamIds[index]}` : `seed:${game.id}`, steam: steamIds[index],
      genre: game.genre, description: game.description, released: game.released ?? null,
      image: game.image, source: game.source, edition: game.edition ?? null }));
    hardware.cpu.forEach(model => ensureHardware(db, 'cpu', model));
    hardware.gpu.forEach(model => ensureHardware(db, 'gpu', model, 'Desktop'));
  })();
}
