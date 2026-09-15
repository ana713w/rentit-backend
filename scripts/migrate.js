import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { db } from '../src/db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

const sql = await readFile(schemaPath, 'utf-8');
await db.query(sql);
console.log('Schema applied successfully.');
await db.end();
