const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'tienda.db');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function checkPassword(pw, stored) {
  const salt = stored.slice(0, 32), hash = stored.slice(32);
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}

function openDb(file = DB_FILE) {
  const isNew = !fs.existsSync(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  if (isNew) {
    db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    require('./seed').seed(db, hashPassword);
    console.log('Base de datos creada y cargada con datos de ejemplo:', file);
  }
  return db;
}

// Ejecuta fn dentro de una transacción; si lanza error, deshace todo.
function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { openDb, tx, hashPassword, checkPassword, DB_FILE };
