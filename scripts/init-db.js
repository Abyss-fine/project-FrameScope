import { openDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
const db = openDatabase();
try {
  seedDatabase(db);
  console.log('SQLite инициализирована. Схема и начальный каталог готовы; существующие данные сохранены.');
} finally { db.close(); }
