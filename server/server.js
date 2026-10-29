// Servidor de STELLAR VAULT: sirve la página y expone la API sobre SQLite. Sin dependencias externas.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDb, tx, hashPassword, checkPassword } = require('./db');
const { validar } = require('../js/rules.js');
const { enviarCorreo } = require('./mail');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const db = openDb();
const q = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const reglas = () => q('SELECT ambito,campo,tipo,valor,condicion,mensaje FROM reglas_validacion ORDER BY id');
const cfg = () => Object.fromEntries(q('SELECT clave,valor FROM configuracion').map(r => [r.clave, r.valor]));

class HttpError extends Error { constructor(status, body) { super(body.error || 'Error'); this.status = status; this.body = body; } }

// Traduce los errores de restricciones de la base de datos a mensajes para el usuario.
function dbError(e) {
  const m = String(e.message || '');
  if (/UNIQUE constraint failed: usuarios\.email/.test(m)) return new HttpError(409, { error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
  if (/Stock insuficiente/.test(m)) return new HttpError(409, { error: 'No hay stock suficiente de uno de los productos. Revisa tu carrito.' });
  if (/no pertenece a la provincia/.test(m)) return new HttpError(422, { errores: { city: 'La ciudad no pertenece a la provincia.' } });
  if (/CHECK constraint|FOREIGN KEY|NOT NULL|UNIQUE/.test(m)) return new HttpError(422, { error: 'Los datos no cumplen las reglas de la base de datos.' });
  return e;
}

const APP_URL = () => process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Evita que un error inesperado apague el servidor.
process.on('uncaughtException', e => console.error('Error no controlado:', e));
process.on('unhandledRejection', e => console.error('Promesa rechazada:', e));

// Límite de peticiones por IP (en memoria) contra abusos y fuerza bruta.
const golpes = new Map();
function limitar(req, clave, max, ventanaMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const k = clave + '|' + ip, ahora = Date.now();
  let h = golpes.get(k);
  if (!h || h.t < ahora) { h = { n: 0, t: ahora + ventanaMs }; golpes.set(k, h); }
  if (++h.n > max) throw new HttpError(429, { error: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
}
setInterval(() => { const n = Date.now(); for (const [k, h] of golpes) if (h.t < n) golpes.delete(k); }, 60000).unref();
const LIMITES = { 'POST /api/login': [10, 60000], 'POST /api/registro': [5, 600000], 'POST /api/reenviar': [5, 600000], 'POST /api/google': [20, 60000], 'POST /api/pedidos': [20, 60000], 'POST /api/comentarios': [20, 60000], 'POST /api/favoritos': [60, 60000] };
const exigirSesion = (user, msg = 'Inicia sesión para continuar.') => { if (!user) throw new HttpError(401, { error: msg, requiereLogin: true }); return user; };

// El navegador que inició el registro recibe un código secreto para saber cuándo se verificó el correo.
const seguimientos = new Map();
function nuevoSeguimiento(uid) {
  const s = crypto.randomBytes(16).toString('hex');
  seguimientos.set(s, { uid, exp: Date.now() + 24 * 3600 * 1000 });
  return s;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of seguimientos) if (v.exp < n) seguimientos.delete(k); }, 600000).unref();

const paginaVerificacion = (ok) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Correo verificado' : 'Enlace no válido'} · STELLAR VAULT</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff5f8;font-family:Inter,Arial,sans-serif;color:#2a1a2e}
.c{background:#fff;border:1px solid #f3d9e1;border-radius:16px;padding:36px 28px;max-width:420px;margin:16px;text-align:center;box-shadow:0 8px 30px rgba(214,32,79,.12)}
.i{width:72px;height:72px;border-radius:50%;margin:0 auto 18px;display:grid;place-items:center;font-size:36px;color:#fff;background:${ok ? '#15803d' : '#b91c1c'}}
h1{margin:0 0 10px;font-size:24px}p{margin:0 0 18px;line-height:1.5;color:#6b5a6e}b{color:#d6204f}
a{display:inline-block;background:#d6204f;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px}</style></head><body><div class="c">
<div class="i">${ok ? '✓' : '!'}</div>
<h1>${ok ? '¡Correo verificado!' : 'Enlace no válido'}</h1>
<p>${ok ? 'Tu cuenta de <b>STELLAR VAULT</b> ya está activa. <b>Puedes cerrar esta ventana</b> y volver a la tienda para iniciar sesión.' : 'Este enlace de verificación no es válido o ya venció. Vuelve a la tienda y pide que te reenviemos uno nuevo.'}</p>
<a href="/#/ingresar">Ir a la tienda</a></div></body></html>`;

// Crea un enlace de verificación (válido 24 h) y lo envía al correo con el que se registró el usuario.
async function enviarVerificacion(u) {
  const token = crypto.randomBytes(32).toString('hex');
  run('DELETE FROM verificaciones WHERE usuario_id=?', u.id);
  run('INSERT INTO verificaciones(token,usuario_id,expira) VALUES (?,?,?)', token, u.id, new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  const enlace = `${APP_URL()}/api/verificar?token=${token}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #f3d9e1;border-radius:12px;padding:24px">
    <h2 style="color:#d6204f;margin:0 0 12px">STELLAR VAULT</h2>
    <p>Hola <b>${String(u.nombre).replace(/[<>&]/g, '')}</b>, gracias por registrarte.</p>
    <p>Para activar tu cuenta confirma que este correo es tuyo:</p>
    <p style="text-align:center;margin:24px 0"><a href="${enlace}" style="background:#d6204f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">Verificar mi correo</a></p>
    <p style="font-size:12px;color:#6b5a6e">Si el botón no funciona, copia este enlace en tu navegador:<br>${enlace}<br>El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p></div>`;
  const m = await enviarCorreo({ to: u.email, subject: 'Verifica tu correo · STELLAR VAULT', html, enlace });
  return { ...m, seguimiento: nuevoSeguimiento(u.id) };
}

const usuarioDe = req => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (t.length !== 64) return null;
  return one('SELECT u.id,u.nombre,u.email FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=?', t) || null;
};
const sesion = uid => { const token = crypto.randomBytes(32).toString('hex'); run('INSERT INTO sesiones(token,usuario_id) VALUES (?,?)', token, uid); return token; };

function productos() {
  const imgs = {};
  q('SELECT producto_id,url FROM imagenes_producto ORDER BY producto_id,orden').forEach(i => (imgs[i.producto_id] ||= []).push(i.url));
  return q(`SELECT p.id AS id,c.codigo AS "cat",p.nombre AS "name",p.autor AS "by",p.editorial AS "pub",p.precio AS "price",p.stock AS "stock",p.color AS "c",p.tinte AS "tint",p.tinte_texto AS "tc",
                   p.preventa AS "pre",p.destacado AS "dest",p.descripcion AS "desc"
            FROM productos p JOIN categorias c ON c.id=p.categoria_id ORDER BY c.orden,p.id`)
    .map(p => ({ ...p, imgs: imgs[p.id] || [] }));
}
const comentarios = () => q('SELECT id,producto_id pid,usuario_id uid,autor n,calificacion r,texto t,fecha d FROM comentarios ORDER BY id');
const favoritos = uid => q('SELECT producto_id FROM favoritos WHERE usuario_id=? ORDER BY fecha DESC,producto_id', uid).map(r => r.producto_id);
const publico = u => ({ id: u.id, nombre: u.nombre, email: u.email });

function pedidosDe(where, ...args) {
  return q(`SELECT * FROM pedidos WHERE ${where} ORDER BY id`, ...args).map(p => {
    const items = q(`SELECT i.producto_id id,pr.nombre n,i.cantidad q,i.precio_unitario pr FROM pedido_items i JOIN productos pr ON pr.id=i.producto_id WHERE i.pedido_id=?`, p.id);
    return {
      id: p.id, no: p.numero, date: p.fecha, paid: !!p.pagado, email: p.email, total: p.total, items,
      dm: p.entrega === 'retiro' ? 'Retiro en tienda' : 'Envío por Servientrega',
      method: p.metodo_pago === 'deuna' ? 'DeUna' : 'Pago en físico (efectivo)',
      units: items.reduce((a, i) => a + i.q, 0),
    };
  });
}

const rutas = {
  'GET /api/health': () => ({ ok: true, productos: one('SELECT count(*) n FROM productos').n }),
  'GET /api/bootstrap': () => {
    const prov = {};
    q('SELECT p.nombre prov,c.nombre ciudad FROM ciudades c JOIN provincias p ON p.id=c.provincia_id ORDER BY p.nombre,c.id').forEach(r => (prov[r.prov] ||= []).push(r.ciudad));
    return { config: cfg(), categorias: q('SELECT codigo,nombre,plural FROM categorias ORDER BY orden'), productos: productos(), provincias: prov, reglas: reglas(), comentarios: comentarios(), google: process.env.GOOGLE_CLIENT_ID || null };
  },
  'GET /api/comentarios': () => ({ comentarios: comentarios() }),
  'POST /api/comentarios': ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para comentar.');
    const err = validar(reglas(), 'comentario', body);
    if (Object.keys(err).length) throw new HttpError(422, { errores: err });
    const prod = one('SELECT id FROM productos WHERE id=?', Number(body.producto_id));
    if (!prod) throw new HttpError(404, { error: 'Producto no encontrado.' });
    run('INSERT INTO comentarios(producto_id,usuario_id,autor,calificacion,texto) VALUES (?,?,?,?,?)', prod.id, user.id, user.nombre, Number(body.calificacion), String(body.texto).trim());
    return { comentarios: comentarios() };
  },
  'DELETE /api/comentarios/:id': ({ params, user }) => {
    exigirSesion(user, 'Inicia sesión para eliminar tu comentario.');
    const r = run('DELETE FROM comentarios WHERE id=? AND usuario_id=?', Number(params.id), user.id);
    if (!r.changes) throw new HttpError(403, { error: 'Solo puedes eliminar tus propios comentarios.' });
    return { comentarios: comentarios() };
  },

  'POST /api/registro': async ({ body }) => {
    if (String(body.password || '').length > 128) throw new HttpError(422, { error: 'La contraseña no puede pasar de 128 caracteres.' });
    const err = validar(reglas(), 'registro', body);
    if (Object.keys(err).length) throw new HttpError(422, { error: Object.values(err)[0], errores: err });
    const email = String(body.email).trim().toLowerCase(), nombre = String(body.nombre).trim();
    let u = one('SELECT id,nombre,email,verificado FROM usuarios WHERE email=?', email);
    if (u && u.verificado) throw new HttpError(409, { error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
    if (u) run('UPDATE usuarios SET nombre=?,password_hash=? WHERE id=?', nombre, hashPassword(String(body.password)), u.id); // registro sin verificar: se reintenta
    else { const r = run('INSERT INTO usuarios(nombre,email,password_hash) VALUES (?,?,?)', nombre, email, hashPassword(String(body.password))); u = { id: Number(r.lastInsertRowid), nombre, email }; }
    try { const m = await enviarVerificacion({ ...u, nombre }); return { pendiente: true, email, simulado: m.simulado, seguimiento: m.seguimiento }; }
    catch (e) { console.error('Error al enviar el correo:', e.message); throw new HttpError(502, { error: 'Tu cuenta se creó, pero no pudimos enviar el correo de verificación. Pide que lo reenviemos.', pendiente: true, email }); }
  },
  'POST /api/reenviar': async ({ body }) => {
    const u = one('SELECT id,nombre,email,verificado FROM usuarios WHERE email=?', String(body.email || '').trim().toLowerCase());
    if (u && !u.verificado) {
      try { const m = await enviarVerificacion(u); return { ok: true, email: u.email, simulado: m.simulado }; }
      catch (e) { console.error('Error al enviar el correo:', e.message); throw new HttpError(502, { error: 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.' }); }
    }
    return { ok: true, email: String(body.email || '') }; // misma respuesta exista o no la cuenta
  },
  'GET /api/verificar': ({ query }) => {
    const v = one('SELECT usuario_id,expira FROM verificaciones WHERE token=?', String(query.get('token') || ''));
    if (!v || v.expira < new Date().toISOString()) return { __html: paginaVerificacion(false) };
    run('UPDATE usuarios SET verificado=1 WHERE id=?', v.usuario_id);
    run('DELETE FROM verificaciones WHERE usuario_id=?', v.usuario_id);
    return { __html: paginaVerificacion(true) };
  },
  'GET /api/verificacion-estado': ({ query }) => {
    const s = seguimientos.get(String(query.get('s') || ''));
    const u = s && one('SELECT verificado FROM usuarios WHERE id=?', s.uid);
    return { verificado: !!(u && u.verificado) };
  },
  'POST /api/login': ({ body }) => {
    if (String(body.password || '').length > 128) throw new HttpError(401, { error: 'Correo o contraseña incorrectos.' });
    const err = validar(reglas(), 'login', body);
    if (Object.keys(err).length) throw new HttpError(422, { error: Object.values(err)[0] });
    const u = one('SELECT id,nombre,email,password_hash,verificado FROM usuarios WHERE email=?', String(body.email).trim());
    if (!u || !checkPassword(String(body.password || ''), u.password_hash)) throw new HttpError(401, { error: 'Correo o contraseña incorrectos.' });
    if (!u.verificado) throw new HttpError(403, { error: 'Aún no verificas tu correo. Revisa tu bandeja de entrada o pide que te reenviemos el enlace.', noVerificado: true, email: u.email, seguimiento: nuevoSeguimiento(u.id) });
    return { token: sesion(u.id), usuario: publico(u) };
  },
  // Inicio de sesión con Google: el navegador manda el "credential" (token de Google) y aquí se verifica con Google.
  'POST /api/google': async ({ body }) => {
    const cid = process.env.GOOGLE_CLIENT_ID;
    if (!cid) throw new HttpError(503, { error: 'El inicio de sesión con Google aún no está configurado en el servidor.' });
    const cred = String(body.credential || '');
    if (cred.length < 20 || cred.length > 4000) throw new HttpError(422, { error: 'Respuesta de Google no válida.' });
    let info;
    try {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred));
      if (!r.ok) throw new Error('rechazado');
      info = await r.json();
    } catch { throw new HttpError(401, { error: 'No pudimos verificar tu cuenta de Google. Intenta de nuevo.' }); }
    if (info.aud !== cid || String(info.email_verified) !== 'true' || !info.email) throw new HttpError(401, { error: 'Tu cuenta de Google no pudo verificarse.' });
    const email = String(info.email).toLowerCase();
    let nombre = String(info.name || email.split('@')[0]).trim().slice(0, 80);
    if (nombre.length < 2) nombre = email.split('@')[0].padEnd(2, '_');
    let u = one('SELECT id,nombre,email FROM usuarios WHERE email=?', email);
    if (!u) {
      const r = run('INSERT INTO usuarios(nombre,email,password_hash,verificado) VALUES (?,?,?,1)', nombre, email, hashPassword(crypto.randomBytes(24).toString('hex')));
      u = { id: Number(r.lastInsertRowid), nombre, email };
    } else run('UPDATE usuarios SET verificado=1 WHERE id=?', u.id); // Google ya comprobó que el correo es suyo
    return { token: sesion(u.id), usuario: publico(u) };
  },
  'POST /api/logout': ({ req }) => { run('DELETE FROM sesiones WHERE token=?', (req.headers.authorization || '').replace(/^Bearer /, '')); return { ok: true }; },
  'GET /api/yo': ({ user }) => ({ usuario: user ? publico(user) : null }),

  'GET /api/favoritos': ({ user }) => ({ favoritos: favoritos(exigirSesion(user, 'Inicia sesión para ver tus favoritos.').id) }),
  'POST /api/favoritos': ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para guardar favoritos.');
    if (!one('SELECT id FROM productos WHERE id=?', Number(body.producto_id))) throw new HttpError(404, { error: 'Producto no encontrado.' });
    run('INSERT OR IGNORE INTO favoritos(usuario_id,producto_id) VALUES (?,?)', user.id, Number(body.producto_id));
    return { favoritos: favoritos(user.id) };
  },
  'DELETE /api/favoritos/:pid': ({ params, user }) => {
    exigirSesion(user, 'Inicia sesión para quitar favoritos.');
    run('DELETE FROM favoritos WHERE usuario_id=? AND producto_id=?', user.id, Number(params.pid));
    return { favoritos: favoritos(user.id) };
  },

  'GET /api/pedidos': ({ user }) => {
    exigirSesion(user, 'Inicia sesión para ver tus pedidos.');
    return { pedidos: pedidosDe('usuario_id=?', user.id) };
  },
  'POST /api/pedidos': ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para comprar.');
    const d = body.datos || {}, dm = body.dm === 'pick' ? 'pick' : 'ship';
    const err = validar(reglas(), 'checkout', { type: 'Casa', ...d, dm });
    if (dm === 'ship') {
      const pr = one('SELECT id FROM provincias WHERE nombre=?', String(d.prov || ''));
      const ci = pr && one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, String(d.city || ''));
      if (!pr && !err.prov) err.prov = 'Selecciona tu provincia.';
      if (!ci && !err.city) err.city = 'Selecciona tu ciudad.';
    }
    if (Object.keys(err).length) throw new HttpError(422, { errores: err });
    if (!['fisico', 'deuna'].includes(body.metodo)) throw new HttpError(422, { error: 'Método de pago no válido.' });
    if (!Array.isArray(body.items) || body.items.length > 50) throw new HttpError(422, { error: 'Tu carrito tiene demasiados productos distintos.' });
    const items = (body.items || []).map(i => ({ q: Number(i.q), prod: one('SELECT id,precio FROM productos WHERE id=?', Number(i.id)) }));
    if (!items.length || items.some(i => !i.prod || !Number.isInteger(i.q) || i.q < 1)) throw new HttpError(422, { error: 'Tu carrito está vacío o tiene productos no válidos.' });
    const c = cfg();
    const subtotal = Math.round(items.reduce((a, i) => a + i.prod.precio * i.q, 0) * 100) / 100;
    const envio = dm === 'pick' || subtotal >= c.envio_gratis_desde ? 0 : c.envio_costo;
    try {
      return tx(db, () => {
        let numero; do { numero = '#SV-2026-' + (1000 + crypto.randomInt(9000)); } while (one('SELECT 1 FROM pedidos WHERE numero=?', numero));
        const pr = dm === 'ship' ? one('SELECT id FROM provincias WHERE nombre=?', String(d.prov)) : null;
        const ci = pr ? one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, String(d.city)) : null;
        const r = run(`INSERT INTO pedidos(numero,usuario_id,nombre,telefono,email,entrega,metodo_pago,provincia_id,ciudad_id,direccion,tipo_vivienda,edificio,piso,unidad,referencia,subtotal,envio,total,pagado)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          numero, user.id, String(d.name).trim(), String(d.tel).replace(/\D/g, ''), String(d.email).trim(), dm === 'pick' ? 'retiro' : 'envio', body.metodo,
          pr && pr.id, ci && ci.id, dm === 'ship' ? String(d.addr).trim() : null, dm === 'ship' ? (d.type || 'Casa') : 'Casa',
          dm === 'ship' ? d.edif || null : null, dm === 'ship' && d.type !== 'Casa' ? String(d.piso).trim() : null, dm === 'ship' && d.type !== 'Casa' ? String(d.unit).trim() : null,
          dm === 'ship' ? d.ref || null : null, subtotal, envio, Math.round((subtotal + envio) * 100) / 100, body.metodo === 'deuna' ? 1 : 0);
        items.forEach(i => run('INSERT INTO pedido_items(pedido_id,producto_id,cantidad,precio_unitario) VALUES (?,?,?,?)', Number(r.lastInsertRowid), i.prod.id, i.q, i.prod.precio));
        return { pedido: pedidosDe('id=?', Number(r.lastInsertRowid))[0] };
      });
    } catch (e) { throw dbError(e); }
  },
};

const ESTATICOS = { '/': 'index.html', '/index.html': 'index.html' };
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function leerCuerpo(req) {
  return new Promise((ok, fail) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 100_000) { fail(new HttpError(413, { error: 'Solicitud demasiado grande.' })); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { fail(new HttpError(400, { error: 'JSON no válido.' })); } });
  });
}
function enviar(res, status, body, tipo = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      limitar(req, 'api', 300, 60000);
      let handler, params = {}, claveRuta = '';
      for (const [k, h] of Object.entries(rutas)) {
        const [metodo, patron] = k.split(' ');
        if (metodo !== req.method) continue;
        const m = url.pathname.match(new RegExp('^' + patron.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'));
        if (m) { handler = h; params = m.groups || {}; claveRuta = k; break; }
      }
      if (!handler) return enviar(res, 404, { error: 'No existe.' });
      if (LIMITES[claveRuta]) limitar(req, claveRuta, ...LIMITES[claveRuta]);
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await leerCuerpo(req);
      const r = await handler({ req, body, params, query: url.searchParams, user: usuarioDe(req) });
      if (r && r.__html) return enviar(res, 200, r.__html, 'text/html; charset=utf-8');
      if (r && r.__redirect) { res.writeHead(302, { Location: r.__redirect }); return res.end(); }
      return enviar(res, 200, r);
    }
    const m = url.pathname.match(/^\/js\/(model|view|controller|rules)\.js$/);
    const file = ESTATICOS[url.pathname] || (m && 'js/' + m[1] + '.js');
    if (!file) return enviar(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    enviar(res, 200, fs.readFileSync(path.join(ROOT, file)), TIPOS[path.extname(file)]);
  } catch (e) {
    if (e instanceof HttpError) return enviar(res, e.status, e.body);
    console.error(e); enviar(res, 500, { error: 'Error del servidor.' });
  }
}).listen(PORT, '0.0.0.0', () => console.log(`STELLAR VAULT en http://localhost:${PORT}`));
