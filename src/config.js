import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const publicDirectory = resolve(root, 'public');
export const databasePath = resolve(root, process.env.DB_PATH || 'data/framescope.sqlite');
