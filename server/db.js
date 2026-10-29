// Base de datos: Turso en la nube si hay TURSO_DATABASE_URL (los datos NO se borran al reiniciar),
// o un archivo SQLite local (server/tienda.db) cuando se prueba en el computador.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function checkPassword(pw, stored) {
  const salt = stored.slice(0, 32), hash = stored.slice(32);
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}

const archivoLocal = () => (process.env.DB_PATH || path.join(__dirname, 'tienda.db')).replace(/\\/g, '/');

// Borra todas las tablas y triggers (solo con RESET_DB=1) para volver a crear el esquema y los datos de ejemplo.
async function vaciar(db) {
  const objs = (await db.execute("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('trigger','table','index')")).rows;
  const orden = { trigger: 0, index: 1, table: 2 };
  const sql = [{ sql: 'PRAGMA foreign_keys = OFF', args: [] }];
  objs.sort((a, b) => orden[a.type] - orden[b.type]).forEach(o => { if (o.type !== 'index' || !o.name.startsWith('sqlite_')) sql.push({ sql: `DROP ${o.type.toUpperCase()} IF EXISTS "${o.name}"`, args: [] }); });
  await db.batch(sql);
  console.log('Base de datos vaciada (RESET_DB=1).');
}

async function openDb() {
  const nube = !!process.env.TURSO_DATABASE_URL;
  const db = createClient({ url: nube ? process.env.TURSO_DATABASE_URL : 'file:' + archivoLocal(), authToken: process.env.TURSO_AUTH_TOKEN });
  if (process.env.RESET_DB === '1') await vaciar(db);
  const hayTablas = (await db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='productos'")).rows.length > 0;
  if (!hayTablas) await db.executeMultiple(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const n = Number((await db.execute('SELECT count(*) AS n FROM productos')).rows[0].n);
  if (n === 0) {
    await require('./seed').seed(db, hashPassword);
    console.log(`Base de datos lista y cargada con datos de ejemplo (${nube ? 'Turso' : 'archivo local'}).`);
  } else console.log(`Base de datos conectada (${nube ? 'Turso' : 'archivo local'}).`);
  return db;
}

module.exports = { openDb, hashPassword, checkPassword };
