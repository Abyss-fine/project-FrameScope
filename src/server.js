import { openDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT должен быть числом от 1 до 65535.');
const db = openDatabase();
seedDatabase(db);
const server = createApp(db).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`FrameScope: http://localhost:${port}`));
server.on('error', error => { console.error('Не удалось запустить сервер:', error.message); db.close(); process.exitCode = 1; });
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
