// Servidor de STELLAR VAULT: sirve la página y expone la API. Base de datos: Turso (nube) o un archivo SQLite local.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDb, hashPassword, checkPassword } = require('./db');
const { validar, descuentoPacks } = require('../js/rules.js');
const { enviarCorreo } = require('./mail');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

let db, D; // se abren al arrancar (la conexión a la base es asíncrona)
const rows = r => r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
const limpio = a => a.map(x => (x === undefined || (typeof x === 'number' && !Number.isFinite(x)) || (typeof x === 'object' && x !== null && !Buffer.isBuffer(x)) ? null : x));
const mk = conn => {
  const o = {
    q: async (sql, ...a) => rows(await conn.execute({ sql, args: limpio(a) })),
    run: async (sql, ...a) => { const r = await conn.execute({ sql, args: limpio(a) }); return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid }; },
  };
  o.one = async (sql, ...a) => (await o.q(sql, ...a))[0];
  return o;
};
const q = (...a) => D.q(...a), one = (...a) => D.one(...a), run = (...a) => D.run(...a);
// Transacción: si algo falla se deshace todo. fn recibe {q, one, run} ligados a la transacción.
async function tx(fn) {
  const t = await db.transaction('write');
  try { const r = await fn(mk(t)); await t.commit(); return r; }
  catch (e) { try { await t.rollback(); } catch {} throw e; }
  finally { t.close(); }
}
const reglas = () => q('SELECT ambito,campo,tipo,valor,condicion,mensaje FROM reglas_validacion ORDER BY id');
const cfg = async () => Object.fromEntries((await q('SELECT clave,valor FROM configuracion')).map(r => [r.clave, r.valor]));


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
  const k = clave + '|' + String(ip).slice(0, 60), ahora = Date.now();
  if (golpes.size > 50000) golpes.clear(); // tope de memoria ante un ataque con miles de IP falsas
  let h = golpes.get(k);
  if (!h || h.t < ahora) { h = { n: 0, t: ahora + ventanaMs }; golpes.set(k, h); }
  if (++h.n > max) throw new HttpError(429, { error: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
}
setInterval(() => { const n = Date.now(); for (const [k, h] of golpes) if (h.t < n) golpes.delete(k); for (const [k, h] of fallosCorreo) if (h.t < n) fallosCorreo.delete(k); }, 60000).unref();
// Fallos de inicio de sesión por correo: 10 en 5 minutos bloquean ese correo un rato, venga de la IP que venga.
const fallosCorreo = new Map();
function revisarFallos(clave) {
  const h = fallosCorreo.get(clave);
  if (h && h.t > Date.now() && h.n >= 10) throw new HttpError(429, { error: 'Demasiados intentos fallidos con este correo. Espera unos minutos e inténtalo de nuevo.' });
}
function anotarFallo(clave) {
  const ahora = Date.now(); let h = fallosCorreo.get(clave);
  if (fallosCorreo.size > 50000) fallosCorreo.clear();
  if (!h || h.t < ahora) { h = { n: 0, t: ahora + 300000 }; fallosCorreo.set(clave, h); }
  h.n++;
}
const LIMITES = { 'POST /api/login': [10, 60000], 'POST /api/registro': [5, 600000], 'POST /api/reenviar': [5, 600000], 'POST /api/google': [20, 60000], 'PUT /api/perfil': [30, 60000], 'POST /api/pagos/:token/confirmar': [30, 60000], 'POST /api/pagos/:token/rechazar': [30, 60000], 'POST /api/perfil/password': [10, 60000], 'POST /api/pedidos': [20, 60000], 'POST /api/comentarios': [20, 60000], 'POST /api/favoritos': [60, 60000] };
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

// 0991234567 -> +593 99 123 4567 (los fijos quedan como +593 2 123 4567)
function formatTel(d) {
  const n = String(d || '').replace(/\D/g, '').replace(/^0/, '');
  if (!n) return '';
  return '+593 ' + (n.length === 9 ? n.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3') : n.replace(/^(\d)(\d{3})(\d{4})$/, '$1 $2 $3'));
}

const MIN_PAGO = 15;
const dinero = n => '$' + Number(n).toFixed(2);
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


// Crea un enlace de verificación (válido 24 h) y lo envía al correo con el que se registró el usuario.
async function enviarVerificacion(u) {
  const token = crypto.randomBytes(32).toString('hex');
  await run('DELETE FROM verificaciones WHERE usuario_id=?', u.id);
  await run('INSERT INTO verificaciones(token,usuario_id,expira) VALUES (?,?,?)', token, u.id, new Date(Date.now() + 24 * 3600 * 1000).toISOString());
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

const usuarioDe = async req => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (t.length !== 64) return null;
  return (await one('SELECT u.id,u.nombre,u.email FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=?', t)) || null;
};
const sesion = async uid => { const token = crypto.randomBytes(32).toString('hex'); await run('INSERT INTO sesiones(token,usuario_id) VALUES (?,?)', token, uid); return token; };

// Packs vigentes: activos y con todos sus productos a la venta.
async function packsActivos() {
  const filas = await q(`SELECT k.id,k.nombre,k.descuento_pct pct,i.producto_id pid,p.activo FROM packs k JOIN pack_items i ON i.pack_id=k.id JOIN productos p ON p.id=i.producto_id WHERE k.activo=1 ORDER BY k.id,i.producto_id`);
  const m = new Map();
  for (const r of filas) { const k = m.get(r.id) || { id: r.id, nombre: r.nombre, pct: r.pct, items: [], ok: true }; k.items.push(r.pid); if (!r.activo) k.ok = false; m.set(r.id, k); }
  return [...m.values()].filter(k => k.ok).map(({ ok, ...k }) => k);
}
// Catálogo, packs, comentarios y reglas: iguales para todos los visitantes, así que se calculan una sola vez cada 5 segundos
// (muchas visitas simultáneas comparten el mismo resultado en vez de repetir ~10 consultas a la base cada una).
// Cualquier cambio (pedido, comentario, administración) borra esta copia y la siguiente visita la recalcula.
let bootPublico = null;
function datosPublicos() {
  if (bootPublico && Date.now() - bootPublico.t < 5000) return bootPublico.p;
  const p = (async () => {
    const prov = {};
    (await q('SELECT p.nombre prov,c.nombre ciudad FROM ciudades c JOIN provincias p ON p.id=c.provincia_id ORDER BY p.nombre,c.id')).forEach(r => (prov[r.prov] ||= []).push(r.ciudad));
    const [config, categorias, prods, reg, coms, packs] = await Promise.all([cfg(), q('SELECT codigo,nombre,plural FROM categorias ORDER BY orden'), productos(), reglas(), comentarios(), packsActivos()]);
    return { config, categorias, productos: prods, provincias: prov, reglas: reg, comentarios: coms, google: process.env.GOOGLE_CLIENT_ID || null, packs };
  })();
  const entrada = bootPublico = { t: Date.now(), p };
  p.catch(() => { if (bootPublico === entrada) bootPublico = null; });
  return p;
}
async function productos() {
  const imgs = {};
  (await q('SELECT producto_id,url FROM imagenes_producto ORDER BY producto_id,orden')).forEach(i => (imgs[i.producto_id] ||= []).push(i.url));
  return (await q(`SELECT p.id AS id,c.codigo AS "cat",p.nombre AS "name",p.autor AS "by",p.editorial AS "pub",p.precio AS "price",p.stock AS "stock",p.color AS "c",p.tinte AS "tint",p.tinte_texto AS "tc",
                   p.preventa AS "pre",p.destacado AS "dest",p.precio_antes AS "was",p.descripcion AS "desc",
                   (SELECT coalesce(sum(i.cantidad),0) FROM pedido_items i JOIN pedidos pe ON pe.id=i.pedido_id WHERE i.producto_id=p.id AND pe.estado<>'cancelado') AS "sold"
            FROM productos p JOIN categorias c ON c.id=p.categoria_id WHERE p.activo=1 ORDER BY c.orden,p.id`)) // los dados de baja no se muestran
    .map(p => ({ ...p, imgs: imgs[p.id] || [] }));
}
const comentarios = () => q('SELECT id,producto_id pid,usuario_id uid,autor n,calificacion r,texto t,fecha d FROM comentarios ORDER BY id');
const favoritos = async uid => (await q('SELECT producto_id FROM favoritos WHERE usuario_id=? ORDER BY fecha DESC,producto_id', uid)).map(r => r.producto_id);
// Perfil completo que el navegador necesita (la foto subida tiene prioridad sobre la de Google).
const perfilDe = async id => {
  const u = await one(`SELECT u.id,u.nombre,u.email,u.registro,u.telefono,u.direccion,u.foto_google,u.foto_subida,p.nombre AS prov,c.nombre AS city
                 FROM usuarios u LEFT JOIN provincias p ON p.id=u.provincia_id LEFT JOIN ciudades c ON c.id=u.ciudad_id WHERE u.id=?`, id);
  return u && { id: u.id, nombre: u.nombre, email: u.email, registro: u.registro, telefono: u.telefono || '', prov: u.prov || '', city: u.city || '', addr: u.direccion || '',
    foto: u.foto_subida || u.foto_google || null, fotoGoogle: u.foto_google || null, fotoSubida: !!u.foto_subida };
};
const publico = u => perfilDe(u.id);

async function pedidosDe(where, ...args) {
  const peds = await q(`SELECT * FROM pedidos WHERE ${where} ORDER BY id`, ...args);
  return Promise.all(peds.map(async p => {
    const items = await q(`SELECT i.producto_id id,pr.nombre n,i.cantidad q,i.precio_unitario pr FROM pedido_items i JOIN productos pr ON pr.id=i.producto_id WHERE i.pedido_id=?`, p.id);
    return {
      id: p.id, no: p.numero, date: p.fecha, paid: !!p.pagado, estado: p.estado, email: p.email, total: p.total, items,
      name: p.nombre, tel: formatTel(p.telefono),
      dm: p.entrega === 'retiro' ? 'Retiro en tienda' : 'Envío por Servientrega',
      method: p.metodo_pago === 'deuna' ? 'DeUna' : 'Pago en físico (efectivo)',
      units: items.reduce((a, i) => a + i.q, 0),
    };
  }));
}

/* ================= Pagos con DeUna (SIMULACIÓN) =================
   Flujo igual al de una pasarela real: el pedido se crea "pendiente_pago" -> el cliente va a la pantalla de pago
   (botón o QR) -> confirma en la "app DeUna" simulada -> vuelve a la tienda con el resultado.
   Solo si el pago se aprueba se marca el pedido como pagado y se envía el comprobante por correo.
   Con una pasarela real (dLocal, DeUna Negocios, etc.) solo cambiarían crearPago/aprobarPago: la pasarela
   avisaría por un webhook firmado en lugar de las pantallas simuladas de abajo. */
const pagoPorToken = t => one('SELECT pg.*,pe.numero,pe.email FROM pagos pg JOIN pedidos pe ON pe.id=pg.pedido_id WHERE pg.token=?', String(t || ''));

async function cerrarPago(pagoId, pedidoId, estado, motivo) {
  await tx(async t => {
    await t.run("UPDATE pagos SET estado=?,motivo=?,resuelto=? WHERE id=? AND estado='pendiente'", estado, motivo, new Date().toISOString(), pagoId);
    await t.run("UPDATE pedidos SET estado='cancelado' WHERE id=? AND estado='pendiente_pago'", pedidoId); // el trigger devuelve el stock
  });
}
async function expirarPendientes() {
  const ahora = new Date().toISOString();
  for (const p of await q("SELECT id,pedido_id FROM pagos WHERE estado='pendiente' AND metodo<>'fisico' AND expira<?", ahora))
    await cerrarPago(p.id, p.pedido_id, 'expirado', 'El tiempo para pagar venció.');
}
setInterval(() => { if (D) expirarPendientes().catch(e => console.error(e)); }, 60000).unref();

async function aprobarPago(token) {
  await expirarPendientes();
  const p = await pagoPorToken(token);
  if (!p || p.metodo === 'fisico') throw new HttpError(404, { error: 'Pago no encontrado.' });
  const n = p.numero.slice(1);
  if (p.estado === 'aprobado') return { redirect: `/pagar.html?pago=ok&n=${n}` };
  if (p.estado !== 'pendiente') return { redirect: `/pagar.html?pago=error&n=${n}&m=${p.estado === 'expirado' ? 'expirado' : 'cancelado'}` };
  await tx(async t => {
    await t.run("UPDATE pagos SET estado='aprobado',resuelto=? WHERE id=?", new Date().toISOString(), p.id);
    await t.run("UPDATE pedidos SET pagado=1,estado='confirmado' WHERE id=?", p.pedido_id);
  });
  enviarComprobante(p.pedido_id).catch(e => console.error('No se pudo enviar el comprobante:', e.message));
  return { redirect: `/pagar.html?pago=ok&n=${n}` };
}
async function rechazarPago(token, motivo) {
  await expirarPendientes();
  const p = await pagoPorToken(token);
  if (!p || p.metodo === 'fisico') throw new HttpError(404, { error: 'Pago no encontrado.' });
  const n = p.numero.slice(1), m = motivo === 'saldo' ? 'saldo' : 'cancelado';
  if (p.estado === 'pendiente') await cerrarPago(p.id, p.pedido_id, m === 'saldo' ? 'rechazado' : 'cancelado', m === 'saldo' ? 'Saldo insuficiente en la cuenta DeUna.' : 'El cliente canceló el pago.');
  return { redirect: p.estado === 'aprobado' ? `/pagar.html?pago=ok&n=${n}` : `/pagar.html?pago=error&n=${n}&m=${p.estado === 'expirado' ? 'expirado' : m}` };
}

async function enviarComprobante(pedidoId) {
  const p = await one(`SELECT pe.*,pr.nombre AS prov,ci.nombre AS city FROM pedidos pe LEFT JOIN provincias pr ON pr.id=pe.provincia_id LEFT JOIN ciudades ci ON ci.id=pe.ciudad_id WHERE pe.id=?`, pedidoId);
  const items = await q('SELECT pr.nombre n,i.cantidad q,i.precio_unitario pu FROM pedido_items i JOIN productos pr ON pr.id=i.producto_id WHERE i.pedido_id=?', pedidoId);
  const pagado = !!p.pagado, desc = Number(p.descuento || 0);
  const gris = '#6b5a6e', linea = '#f1e4ea';
  const dato = (k, v) => `<tr><td style="padding:6px 0;color:${gris};font-size:13px;width:40%;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#2a1a2e">${v}</td></tr>`;
  const total = (k, v, fuerte, color) => `<tr><td style="padding:${fuerte ? '12px' : '5px'} 0 0;font-size:${fuerte ? 16 : 14}px;color:${fuerte ? '#2a1a2e' : gris};font-weight:${fuerte ? 800 : 400}">${k}</td><td style="padding:${fuerte ? '12px' : '5px'} 0 0;text-align:right;font-size:${fuerte ? 20 : 14}px;font-weight:${fuerte ? 800 : 600};color:${color || '#2a1a2e'}">${v}</td></tr>`;
  const filas = items.map(i => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${linea};font-size:14px;color:#2a1a2e">${escHtml(i.n)}<div style="font-size:12px;color:${gris}">${dinero(i.pu)} c/u</div></td>
      <td style="padding:10px 0;border-bottom:1px solid ${linea};font-size:14px;text-align:center;color:${gris}">${i.q}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${linea};font-size:14px;text-align:right;font-weight:700;color:#2a1a2e">${dinero(i.pu * i.q)}</td></tr>`).join('');
  const entrega = p.entrega === 'retiro' ? 'Retiro en tienda (Quito)' : 'Servientrega · ' + escHtml([p.direccion, p.city, p.prov].filter(Boolean).join(', '));
  const fecha = new Date(p.fecha).toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' });
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6eef2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6eef2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#d6204f;padding:22px 28px;color:#ffffff">
    <div style="font-size:20px;font-weight:800;letter-spacing:.04em">STELLAR VAULT</div>
    <div style="font-size:13px;opacity:.9;margin-top:2px">Mangas · Novelas ligeras · Figuras</div></td></tr>
  <tr><td style="padding:26px 28px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:22px;font-weight:800;color:#2a1a2e">Comprobante de ${pagado ? 'pago' : 'pedido'}</td>
      <td align="right"><span style="display:inline-block;background:${pagado ? '#dcfce7' : '#fef3c7'};color:${pagado ? '#166534' : '#92400e'};font-size:12px;font-weight:800;border-radius:20px;padding:6px 12px">${pagado ? '✓ PAGADO' : 'PAGO PENDIENTE'}</span></td></tr></table>
    <p style="font-size:14px;color:${gris};margin:10px 0 0;line-height:1.5">Hola <b style="color:#2a1a2e">${escHtml(p.nombre)}</b>, ${pagado ? 'recibimos tu pago.' : 'registramos tu pedido; pagarás en efectivo ' + (p.entrega === 'retiro' ? 'al retirarlo.' : 'al recibirlo.')} ¡Gracias por tu compra!</p></td></tr>
  <tr><td style="padding:18px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf6f8;border-radius:12px;padding:10px 16px">
      ${dato('N.º de pedido', escHtml(p.numero))}${dato('Fecha', fecha)}${dato('Teléfono', escHtml(formatTel(p.telefono)))}${dato('Correo', escHtml(p.email))}
      ${dato('Pago', p.metodo_pago === 'deuna' ? 'DeUna' : 'Efectivo')}${dato('Entrega', entrega)}</table></td></tr>
  <tr><td style="padding:22px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><th align="left" style="font-size:11px;color:${gris};letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid ${linea}">PRODUCTO</th><th style="font-size:11px;color:${gris};letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid ${linea};width:50px">CANT.</th><th align="right" style="font-size:11px;color:${gris};letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid ${linea};width:90px">IMPORTE</th></tr>
      ${filas}</table></td></tr>
  <tr><td style="padding:14px 28px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${desc > 0 ? total('Productos', dinero(p.subtotal + desc)) + total('Descuento por packs', '−' + dinero(desc), false, '#b45309') : ''}
      ${total('Subtotal', dinero(p.subtotal))}${total(p.entrega === 'retiro' ? 'Retiro en tienda' : 'Envío', p.envio ? dinero(p.envio) : 'Gratis')}
      <tr><td colspan="2" style="border-bottom:1px solid ${linea};padding-top:10px"></td></tr>
      ${total(pagado ? 'Total pagado' : 'Total a pagar', dinero(p.total) + ' USD', true, '#d6204f')}</table></td></tr>
  <tr><td style="background:#fbf6f8;padding:18px 28px;font-size:12px;color:${gris};line-height:1.6">
    ¿Dudas con tu pedido? Escríbenos a <b style="color:#2a1a2e">santiagoquiguango@hotmail.com</b> o llama al <b style="color:#2a1a2e">096368732</b>.<br>
    <span style="color:#9a8a9d">Comprobante de compra de demostración; no reemplaza una factura electrónica autorizada por el SRI.</span></td></tr>
</table></td></tr></table></body></html>`;
  await enviarCorreo({ to: p.email, subject: `${pagado ? 'Comprobante de pago' : 'Comprobante de pedido'} ${p.numero} · STELLAR VAULT`, html, enlace: '(comprobante)' });
}

// Pantallas de la pasarela simulada (no usan logos ni marcas reales).
const paginaPago = (titulo, cuerpo, script = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} · STELLAR VAULT</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:#eef2ff;color:#1f2340;min-height:100vh}
.test{background:#fde047;color:#4a1d00;text-align:center;font-size:13px;font-weight:700;padding:8px}
.w{max-width:480px;margin:0 auto;padding:16px}.card{background:#fff;border-radius:14px;padding:22px;box-shadow:0 4px 20px rgba(31,35,64,.12)}
.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid #eee}.chip{background:#4c1d95;color:#fff;font-size:12px;font-weight:700;border-radius:6px;padding:4px 10px}
.monto{display:flex;justify-content:space-between;padding:16px 0;font-size:18px;border-bottom:1px solid #eee}h1{font-size:30px;margin:24px 0}h2{font-size:15px;margin:18px 0 8px}ol{padding-left:20px;line-height:1.6;color:#44486b}
.btn{display:block;width:100%;border:0;border-radius:8px;background:#3b6ef0;color:#fff;font-weight:700;letter-spacing:.08em;text-align:center;text-decoration:none;padding:16px;font-size:15px;margin-top:18px;cursor:pointer}
.btn.pur{background:#4c1d95;letter-spacing:0;font-size:17px;border-radius:14px}.btn.sec{background:#fff;color:#4c1d95;border:2px solid #4c1d95}.btn:disabled{opacity:.6}
.peq{font-size:12px;color:#6b6f8f;text-align:center;margin:14px 0 0}.bar{display:flex;justify-content:space-between;padding:6px 0}.bar a{color:#4c1d95;font-weight:700;text-decoration:none}
.row{display:flex;gap:16px;align-items:center;margin:22px 0}.ic{width:54px;height:54px;border-radius:50%;background:#eceef8;display:grid;place-items:center;font-weight:700;flex:none}.row small{display:block;color:#6b6f8f}.row b{display:block;font-size:18px}.row span{color:#6b6f8f}
.tot{display:flex;justify-content:space-between;font-weight:700;margin:18px 0 6px}</style></head><body><div class="test">MODO DE PRUEBA · simulación de pago · no se cobra dinero real</div><div class="w">${cuerpo}</div>${script}</body></html>`;

const paginaEstadoPago = p => paginaPago('Pago procesado', `<div class="card" style="text-align:center"><h1 style="margin-top:0">${p.estado === 'aprobado' ? '✓ Pago realizado' : 'Pago no disponible'}</h1><p>${p.estado === 'aprobado' ? 'Este pago ya fue aprobado.' : 'Este pago ya no se puede completar (' + escHtml(p.estado) + ').'}</p><a class="btn" href="/?pago=${p.estado === 'aprobado' ? 'ok' : 'error'}&n=${p.numero.slice(1)}&m=${p.estado === 'expirado' ? 'expirado' : 'cancelado'}">VOLVER A LA TIENDA</a></div>`);
const paginaPasarela = p => paginaPago('Pagar con DeUna', `<div class="card"><div class="top"><b>STELLAR VAULT</b><span class="chip">DeUna · simulación</span></div>
  <div class="monto"><span>Monto a pagar:</span><b>${dinero(p.monto)}</b></div>
  <h2>Cómo pagar con DeUna</h2><ol><li>Pulsa el botón «Finaliza tu pago con DeUna».</li><li>Confirma el monto a pagar y completa el pago.</li><li>Recibirás un correo confirmando tu pago.</li><li>Tu pedido se procesa una vez que el pago está aprobado.</li></ol>
  <a class="btn" href="/pago/${p.token}/app">FINALIZA TU PAGO CON DEUNA</a>
  <p class="peq">Pedido ${escHtml(p.numero)} · el enlace vence a las ${new Date(p.expira).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</p></div>`);
const paginaApp = p => paginaPago('Confirmemos tu pago', `<div class="bar"><span></span><a href="#" id="cancelar">Cancelar</a></div><h1>Confirmemos tu pago</h1>
  <div class="row"><div class="ic">SV</div><div><small>Para</small><b>STELLAR VAULT</b><span>Pedido ${escHtml(p.numero)}</span></div></div>
  <div class="row"><div class="ic">$</div><div><small>Monto</small><b>USD ${dinero(p.monto)}</b></div></div>
  <div class="row"><div class="ic" style="background:#4c1d95;color:#fff">d</div><div><small>Desde</small><b>Mi cuenta DeUna (simulada)</b><span>******0000</span></div></div>
  <div class="tot"><span>Total del pago</span><b>${dinero(p.monto)}</b></div>
  <button class="btn pur" id="pagar">Pagar</button><button class="btn pur sec" id="saldo" style="margin-top:10px">Simular saldo insuficiente</button>`,
  `<script>const T=${JSON.stringify(p.token)};
async function accion(a,motivo){document.querySelectorAll('button,a').forEach(b=>b.disabled=true);document.getElementById('pagar').textContent='Procesando…';
 try{const r=await fetch('/api/pagos/'+T+'/'+a,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({motivo})});const d=await r.json();location.href=d.redirect||'/'}catch(e){location.href='/'}}
document.getElementById('pagar').onclick=()=>accion('confirmar');
document.getElementById('saldo').onclick=()=>accion('rechazar','saldo');
document.getElementById('cancelar').onclick=e=>{e.preventDefault();accion('rechazar','cancelado')};</script>`);

const rutas = {
  'GET /api/health': async () => ({ ok: true, productos: (await one('SELECT count(*) AS n FROM productos')).n }),
  // Con sesión, la misma respuesta trae el usuario y sus favoritos (una sola petición al abrir cada página).
  'GET /api/bootstrap': async ({ user }) => {
    const [pub, yo, favs] = await Promise.all([datosPublicos(), user ? publico(user) : null, user ? favoritos(user.id) : []]);
    return { ...pub, usuario: yo, favoritos: favs };
  },
  'GET /api/comentarios': async () => ({ comentarios: await comentarios() }),
  'POST /api/comentarios': async ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para comentar.');
    const err = validar(await reglas(), 'comentario', body);
    if (Object.keys(err).length) throw new HttpError(422, { errores: err });
    const prod = await one('SELECT id FROM productos WHERE id=?', Number(body.producto_id));
    if (!prod) throw new HttpError(404, { error: 'Producto no encontrado.' });
    await run('INSERT INTO comentarios(producto_id,usuario_id,autor,calificacion,texto) VALUES (?,?,?,?,?)', prod.id, user.id, user.nombre, Number(body.calificacion), String(body.texto).trim());
    return { comentarios: await comentarios() };
  },
  'DELETE /api/comentarios/:id': async ({ params, user }) => {
    exigirSesion(user, 'Inicia sesión para eliminar tu comentario.');
    const r = await run('DELETE FROM comentarios WHERE id=? AND usuario_id=?', Number(params.id), user.id);
    if (!r.changes) throw new HttpError(403, { error: 'Solo puedes eliminar tus propios comentarios.' });
    return { comentarios: await comentarios() };
  },

  'POST /api/registro': async ({ body }) => {
    if (String(body.password || '').length > 128) throw new HttpError(422, { error: 'La contraseña no puede pasar de 128 caracteres.' });
    const err = validar(await reglas(), 'registro', body);
    if (Object.keys(err).length) throw new HttpError(422, { error: Object.values(err)[0], errores: err });
    const email = String(body.email).trim().toLowerCase(), nombre = String(body.nombre).trim();
    if (nombre.length > 80 || email.length > 120) throw new HttpError(422, { error: nombre.length > 80 ? 'El nombre no puede pasar de 80 caracteres.' : 'El correo no puede pasar de 120 caracteres.' });
    let u = await one('SELECT id,nombre,email,verificado FROM usuarios WHERE email=?', email);
    if (u && u.verificado) throw new HttpError(409, { error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
    if (u) await run('UPDATE usuarios SET nombre=?,password_hash=? WHERE id=?', nombre, hashPassword(String(body.password)), u.id); // registro sin verificar: se reintenta
    else { const r = await run('INSERT INTO usuarios(nombre,email,password_hash) VALUES (?,?,?)', nombre, email, hashPassword(String(body.password))); u = { id: Number(r.lastInsertRowid), nombre, email }; }
    try { const m = await enviarVerificacion({ ...u, nombre }); return { pendiente: true, email, simulado: m.simulado, seguimiento: m.seguimiento }; }
    catch (e) { console.error('Error al enviar el correo:', e.message); throw new HttpError(502, { error: 'Tu cuenta se creó, pero no pudimos enviar el correo de verificación. Pide que lo reenviemos.', pendiente: true, email }); }
  },
  'POST /api/reenviar': async ({ body }) => {
    const u = await one('SELECT id,nombre,email,verificado FROM usuarios WHERE email=?', String(body.email || '').trim().toLowerCase());
    if (u && !u.verificado) {
      try { const m = await enviarVerificacion(u); return { ok: true, email: u.email, simulado: m.simulado }; }
      catch (e) { console.error('Error al enviar el correo:', e.message); throw new HttpError(502, { error: 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.' }); }
    }
    return { ok: true, email: String(body.email || '') }; // misma respuesta exista o no la cuenta
  },
  'GET /api/verificar': async ({ query }) => {
    const v = await one('SELECT usuario_id,expira FROM verificaciones WHERE token=?', String(query.get('token') || ''));
    if (!v || v.expira < new Date().toISOString()) return { __html: paginaVerificacion(false) };
    await run('UPDATE usuarios SET verificado=1 WHERE id=?', v.usuario_id);
    await run('DELETE FROM verificaciones WHERE usuario_id=?', v.usuario_id);
    return { __html: paginaVerificacion(true) };
  },
  'GET /api/verificacion-estado': async ({ query }) => {
    const s = seguimientos.get(String(query.get('s') || ''));
    const u = s && await one('SELECT verificado FROM usuarios WHERE id=?', s.uid);
    return { verificado: !!(u && u.verificado) };
  },
  'POST /api/login': async ({ body }) => {
    if (String(body.password || '').length > 128) throw new HttpError(401, { error: 'Correo o contraseña incorrectos.' });
    const err = validar(await reglas(), 'login', body);
    if (Object.keys(err).length) throw new HttpError(422, { error: Object.values(err)[0] });
    const claveCorreo = String(body.email).trim().toLowerCase().slice(0, 120);
    revisarFallos(claveCorreo);
    const u = await one('SELECT id,nombre,email,password_hash,verificado FROM usuarios WHERE email=?', String(body.email).trim());
    if (!u || !checkPassword(String(body.password || ''), u.password_hash)) { anotarFallo(claveCorreo); throw new HttpError(401, { error: 'Correo o contraseña incorrectos.' }); }
    fallosCorreo.delete(claveCorreo);
    if (!u.verificado) throw new HttpError(403, { error: 'Aún no verificas tu correo. Revisa tu bandeja de entrada o pide que te reenviemos el enlace.', noVerificado: true, email: u.email, seguimiento: nuevoSeguimiento(u.id) });
    return { token: await sesion(u.id), usuario: await publico(u) };
  },
  // Inicio de sesión con Google: el navegador manda el "credential" (token de Google) y aquí se verifica con Google.
  'POST /api/google': async ({ body }) => {
    const cid = process.env.GOOGLE_CLIENT_ID;
    if (!cid) throw new HttpError(503, { error: 'El inicio de sesión con Google aún no está configurado en el servidor.' });
    const cred = String(body.credential || '');
    if (cred.length < 20 || cred.length > 4000) throw new HttpError(422, { error: 'Respuesta de Google no válida.' });
    let info;
    try { info = await verificarTokenGoogle(cred); }
    catch {
      try { // respaldo: preguntar a Google directamente
        const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred));
        if (!r.ok) throw new Error('rechazado');
        info = await r.json();
      } catch { throw new HttpError(401, { error: 'No pudimos verificar tu cuenta de Google. Intenta de nuevo.' }); }
    }
    if (info.aud !== cid || String(info.email_verified) !== 'true' || !info.email) throw new HttpError(401, { error: 'Tu cuenta de Google no pudo verificarse.' });
    const email = String(info.email).toLowerCase();
    let nombre = String(info.name || email.split('@')[0]).trim().slice(0, 80);
    if (nombre.length < 2) nombre = email.split('@')[0].padEnd(2, '_');
    let u = await one('SELECT id,nombre,email FROM usuarios WHERE email=?', email);
    if (!u) {
      const r = await run("INSERT INTO usuarios(nombre,email,password_hash,verificado,registro) VALUES (?,?,?,1,'google')", nombre, email, hashPassword(crypto.randomBytes(24).toString('hex')));
      u = { id: Number(r.lastInsertRowid), nombre, email };
    }
    // Google ya comprobó que el correo es suyo; la foto de Google se sincroniza en cada inicio de sesión (una sola consulta)
    const pic = String(info.picture || '');
    await run('UPDATE usuarios SET verificado=1, foto_google=COALESCE(?,foto_google) WHERE id=?', pic.startsWith('https://') && pic.length < 500 ? pic : null, u.id);
    const [token, usuario] = await Promise.all([sesion(u.id), publico(u)]);
    return { token, usuario };
  },
  // Perfil: el usuario edita sus datos y su foto (la foto de Google se sincroniza al iniciar sesión con Google).
  'PUT /api/perfil': async ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para editar tu perfil.');
    const d = { nombre: String(body.nombre || '').trim(), telefono: String(body.telefono || '').trim(), addr: String(body.addr || '').trim() };
    const err = validar(await reglas(), 'perfil', d);
    if (d.nombre.length > 80) err.nombre = 'El nombre no puede pasar de 80 caracteres.';
    let pid = null, cid = null;
    const prov = String(body.prov || ''), city = String(body.city || '');
    if (prov || city) {
      const pr = await one('SELECT id FROM provincias WHERE nombre=?', prov);
      const ci = pr && await one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, city);
      if (!pr) err.city = 'Selecciona una provincia válida.'; else if (!ci) err.city = 'Selecciona tu ciudad.'; else { pid = pr.id; cid = ci.id; }
    }
    let foto; // undefined = no tocar, null = quitar la foto subida
    if (body.foto !== undefined) {
      if (body.foto === null || body.foto === '') foto = null;
      else if (typeof body.foto === 'string' && body.foto.length <= 150000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.foto)) foto = body.foto;
      else err.foto = 'La foto no es válida o pesa demasiado.';
    }
    if (Object.keys(err).length) throw new HttpError(422, { errores: err });
    try {
      await run('UPDATE usuarios SET nombre=?,telefono=?,provincia_id=?,ciudad_id=?,direccion=? WHERE id=?', d.nombre, d.telefono.replace(/\D/g, '') || null, pid, cid, d.addr || null, user.id);
      if (foto !== undefined) await run('UPDATE usuarios SET foto_subida=? WHERE id=?', foto, user.id);
    } catch (e) { throw dbError(e); }
    return { usuario: await perfilDe(user.id) };
  },
  'POST /api/perfil/password': async ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para cambiar tu contraseña.');
    const u = await one('SELECT password_hash,registro FROM usuarios WHERE id=?', user.id);
    if (u.registro === 'google') throw new HttpError(400, { error: 'Tu cuenta entra con Google y no tiene contraseña en la tienda.' });
    const nueva = String(body.nueva || ''), actual = String(body.actual || '');
    if (actual.length > 128 || nueva.length > 128) throw new HttpError(422, { error: 'La contraseña no puede pasar de 128 caracteres.' });
    if (!checkPassword(actual, u.password_hash)) throw new HttpError(401, { error: 'La contraseña actual no es correcta.' });
    const err = validar(await reglas(), 'clave', { nueva });
    if (err.nueva) throw new HttpError(422, { error: err.nueva });
    await run('UPDATE usuarios SET password_hash=? WHERE id=?', hashPassword(nueva), user.id);
    return { ok: true };
  },
  'POST /api/logout': async ({ req }) => { await run('DELETE FROM sesiones WHERE token=?', (req.headers.authorization || '').replace(/^Bearer /, '')); return { ok: true }; },
  'GET /api/yo': async ({ user }) => ({ usuario: user ? await publico(user) : null }),

  'GET /api/favoritos': async ({ user }) => ({ favoritos: await favoritos(exigirSesion(user, 'Inicia sesión para ver tus favoritos.').id) }),
  'POST /api/favoritos': async ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para guardar favoritos.');
    if (!(await one('SELECT id FROM productos WHERE id=?', Number(body.producto_id)))) throw new HttpError(404, { error: 'Producto no encontrado.' });
    await run('INSERT OR IGNORE INTO favoritos(usuario_id,producto_id) VALUES (?,?)', user.id, Number(body.producto_id));
    return { favoritos: await favoritos(user.id) };
  },
  'DELETE /api/favoritos/:pid': async ({ params, user }) => {
    exigirSesion(user, 'Inicia sesión para quitar favoritos.');
    await run('DELETE FROM favoritos WHERE usuario_id=? AND producto_id=?', user.id, Number(params.pid));
    return { favoritos: await favoritos(user.id) };
  },

  'GET /api/pedidos': async ({ user }) => {
    exigirSesion(user, 'Inicia sesión para ver tus pedidos.');
    return { pedidos: await pedidosDe('usuario_id=?', user.id) };
  },
  'GET /api/pagos/estado': async ({ query }) => {
    await expirarPendientes();
    const p = await pagoPorToken(query.get('t'));
    return p ? { estado: p.estado, numero: p.numero.slice(1) } : { estado: 'desconocido' };
  },
  'POST /api/pagos/:token/confirmar': ({ params }) => aprobarPago(params.token),
  'POST /api/pagos/:token/rechazar': ({ params, body }) => rechazarPago(params.token, body.motivo),
  'GET /api/pedidos/estado': async ({ query, user }) => {
    exigirSesion(user, 'Inicia sesión para ver tu pedido.');
    const ped = (await pedidosDe('usuario_id=? AND numero=?', user.id, '#' + String(query.get('n') || '')))[0];
    if (!ped) throw new HttpError(404, { error: 'Pedido no encontrado.' });
    return { pedido: ped };
  },
  'POST /api/pedidos': async ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para comprar.');
    const d = body.datos || {}, dm = body.dm === 'pick' ? 'pick' : 'ship';
    const err = validar(await reglas(), 'checkout', { type: 'Casa', ...d, dm });
    if (dm === 'ship') {
      const pr = await one('SELECT id FROM provincias WHERE nombre=?', String(d.prov || ''));
      const ci = pr && await one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, String(d.city || ''));
      if (!pr && !err.prov) err.prov = 'Selecciona tu provincia.';
      if (!ci && !err.city) err.city = 'Selecciona tu ciudad.';
    }
    if (Object.keys(err).length) throw new HttpError(422, { errores: err });
    if (!['fisico', 'deuna'].includes(body.metodo)) throw new HttpError(422, { error: 'Método de pago no válido.' });
    if (!Array.isArray(body.items) || body.items.length > 50) throw new HttpError(422, { error: 'Tu carrito tiene demasiados productos distintos.' });
    const itemsBrutos = await Promise.all((body.items || []).map(async i => ({ q: Number(i && i.q), prod: await one('SELECT id,precio FROM productos WHERE id=? AND activo=1', Number.isInteger(Number(i && i.id)) ? Number(i.id) : null) })));
    if (!itemsBrutos.length || itemsBrutos.some(i => !i.prod || !Number.isInteger(i.q) || i.q < 1)) throw new HttpError(422, { error: 'Tu carrito está vacío o tiene productos no válidos.' });
    // Si un producto viene repetido en la lista se suman sus cantidades (la base solo admite una línea por producto).
    const unidos = new Map();
    for (const i of itemsBrutos) { const x = unidos.get(i.prod.id); if (x) x.q += i.q; else unidos.set(i.prod.id, { ...i }); }
    const items = [...unidos.values()];
    // Un pedido nuevo reemplaza los pagos DeUna que el usuario dejó sin terminar (así no se retiene stock).
    for (const x of await q("SELECT pg.id,pg.pedido_id FROM pagos pg JOIN pedidos pe ON pe.id=pg.pedido_id WHERE pe.usuario_id=? AND pg.estado='pendiente' AND pg.metodo<>'fisico'", user.id))
      await cerrarPago(x.id, x.pedido_id, 'cancelado', 'Reemplazado por un pedido nuevo.');
    const c = await cfg();
    // El subtotal ya incluye el descuento por packs (la misma función que usa el carrito del navegador).
    const descuento = descuentoPacks(items.map(i => ({ id: i.prod.id, precio: i.prod.precio, q: i.q })), (await packsActivos()).map(k => ({ id: k.id, nombre: k.nombre, pct: k.pct, ids: k.items }))).total;
    const subtotal = Math.round((items.reduce((a, i) => a + i.prod.precio * i.q, 0) - descuento) * 100) / 100;
    const envio = dm === 'pick' || subtotal >= c.envio_gratis_desde ? 0 : c.envio_costo;
    const totalPed = Math.round((subtotal + envio) * 100) / 100;
    try {
      const { pid, pago } = await tx(async t => {
        let numero; do { numero = '#SV-2026-' + (1000 + crypto.randomInt(9000)); } while (await t.one('SELECT 1 AS x FROM pedidos WHERE numero=?', numero));
        const pr = dm === 'ship' ? await t.one('SELECT id FROM provincias WHERE nombre=?', String(d.prov)) : null;
        const ci = pr ? await t.one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, String(d.city)) : null;
        const r = await t.run(`INSERT INTO pedidos(numero,usuario_id,nombre,telefono,email,entrega,metodo_pago,provincia_id,ciudad_id,direccion,tipo_vivienda,edificio,piso,unidad,referencia,subtotal,descuento,envio,total,pagado)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          numero, user.id, String(d.name).trim(), String(d.tel).replace(/\D/g, ''), String(d.email).trim(), dm === 'pick' ? 'retiro' : 'envio', body.metodo,
          pr && pr.id, ci && ci.id, dm === 'ship' ? String(d.addr).trim() : null, dm === 'ship' ? (d.type || 'Casa') : 'Casa',
          dm === 'ship' ? d.edif || null : null, dm === 'ship' && d.type !== 'Casa' ? String(d.piso).trim() : null, dm === 'ship' && d.type !== 'Casa' ? String(d.unit).trim() : null,
          dm === 'ship' ? d.ref || null : null, subtotal, descuento, envio, totalPed, 0);
        const pid = Number(r.lastInsertRowid);
        for (const i of items) await t.run('INSERT INTO pedido_items(pedido_id,producto_id,cantidad,precio_unitario) VALUES (?,?,?,?)', pid, i.prod.id, i.q, i.prod.precio);
        let pago = null;
        if (body.metodo === 'deuna') {
          const tok = crypto.randomBytes(24).toString('hex'), expira = new Date(Date.now() + MIN_PAGO * 60000).toISOString();
          await t.run("UPDATE pedidos SET estado='pendiente_pago' WHERE id=?", pid);
          await t.run('INSERT INTO pagos(pedido_id,token,metodo,monto,expira) VALUES (?,?,?,?,?)', pid, tok, body.canal === 'qr' ? 'deuna_qr' : 'deuna_boton', totalPed, expira);
          pago = { token: tok, url: '/pago/' + tok, expira };
        } else {
          await t.run("INSERT INTO pagos(pedido_id,token,metodo,monto,estado,expira) VALUES (?,?,'fisico',?,'pendiente',?)", pid, crypto.randomBytes(24).toString('hex'), totalPed, new Date().toISOString());
        }
        return { pid, pago };
      });
      const out = { pedido: (await pedidosDe('id=?', pid))[0], pago };
      if (!out.pago) enviarComprobante(out.pedido.id).catch(e => console.error('No se pudo enviar el comprobante:', e.message));
      return out;
    } catch (e) { throw dbError(e); }
  },
};


/* ---- Fotos de productos: carpeta img/ ----
   Nombre de cada archivo: <nombre-del-producto-en-minusculas-con-guiones>-frente.jpg  y  ...-atras.jpg
   Al arrancar, el servidor las enlaza solo con cada producto (tabla imagenes_producto). */
const IMG_DIR = path.join(ROOT, 'img');
const TIPOS_IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const slugNombre = n => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function sincronizarImagenes() {
  if (!fs.existsSync(IMG_DIR)) return;
  const archivos = new Set(fs.readdirSync(IMG_DIR));
  let cambios = 0;
  for (const p of await q('SELECT id,nombre FROM productos')) {
    const s = slugNombre(p.nombre), vistas = [];
    for (const v of ['frente', 'atras']) {
      const f = ['jpg', 'jpeg', 'png', 'webp'].map(e => `${s}-${v}.${e}`).find(x => archivos.has(x));
      if (f) vistas.push('img/' + f); else if (v === 'frente') break; // sin foto de frente no se usa la trasera
    }
    if (!vistas.length) continue;
    const actual = (await q('SELECT url FROM imagenes_producto WHERE producto_id=? ORDER BY orden', p.id)).map(r => r.url);
    if (JSON.stringify(actual) === JSON.stringify(vistas)) continue;
    await tx(async t => {
      await t.run('DELETE FROM imagenes_producto WHERE producto_id=?', p.id);
      for (const [i, u] of vistas.entries()) await t.run('INSERT INTO imagenes_producto(producto_id,url,orden) VALUES (?,?,?)', p.id, u, i + 1);
    });
    cambios++;
  }
  if (cambios) console.log(`Fotos enlazadas con la base: ${cambios} producto(s).`);
}

/* ---- Actualiza el catálogo de una base ya creada (Turso) sin borrar usuarios, pedidos ni comentarios ----
   Renombra los títulos reemplazados, agrega los nuevos, aplica las rebajas y los packs y fija el envío gratis. */
/* ---- Verificación del inicio con Google ----
   El token de Google viene firmado (JWT RS256). Se comprueba aquí con las claves públicas de Google,
   que se descargan una vez y se guardan en memoria; así el inicio de sesión no espera otra consulta a Google. */
let clavesGoogle = { claves: {}, vence: 0 };
async function claveGoogle(kid) {
  if (!clavesGoogle.claves[kid] || Date.now() > clavesGoogle.vence) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) throw new Error('sin claves');
    const edad = Number((/max-age=(\d+)/.exec(r.headers.get('cache-control') || '') || [])[1] || 3600);
    clavesGoogle = { claves: Object.fromEntries((await r.json()).keys.map(k => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])), vence: Date.now() + edad * 1000 };
  }
  return clavesGoogle.claves[kid];
}
async function verificarTokenGoogle(cred) {
  const [h, p, firma] = cred.split('.');
  const cab = JSON.parse(Buffer.from(h, 'base64url')), info = JSON.parse(Buffer.from(p, 'base64url'));
  const clave = cab.alg === 'RS256' && await claveGoogle(cab.kid);
  if (!clave || !crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), clave, Buffer.from(firma, 'base64url'))) throw new Error('firma');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss) || Number(info.exp) * 1000 < Date.now()) throw new Error('vencido');
  return info;
}

async function actualizarCatalogo() {
  const cols = async t => (await q(`PRAGMA table_info(${t})`)).map(c => c.name);
  if (!(await cols('pedidos')).includes('descuento')) await run('ALTER TABLE pedidos ADD COLUMN descuento REAL NOT NULL DEFAULT 0 CHECK (descuento >= 0)');
  const { filasSemilla, RENOMBRES, PACKS, REBAJAS, ENVIO_GRATIS } = require('./seed');
  await run('CREATE TABLE IF NOT EXISTS packs (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) BETWEEN 3 AND 80), descuento_pct INTEGER NOT NULL CHECK (descuento_pct BETWEEN 1 AND 60), activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)))');
  await run('CREATE TABLE IF NOT EXISTS pack_items (pack_id INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE, producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE, PRIMARY KEY (pack_id, producto_id))');
  if (!(await cols('productos')).includes('precio_antes')) await run('ALTER TABLE productos ADD COLUMN precio_antes REAL CHECK (precio_antes IS NULL OR precio_antes > precio)');
  await run("UPDATE configuracion SET valor=? WHERE clave='envio_gratis_desde'", ENVIO_GRATIS);
  const filas = Object.fromEntries(filasSemilla().map(f => [f[0], f]));
  let cambios = 0;
  for (const [viejo, nuevo] of RENOMBRES) {
    const p = await one('SELECT id FROM productos WHERE nombre=?', viejo);
    if (!p || await one('SELECT 1 AS x FROM productos WHERE nombre=?', nuevo)) continue;
    const f = filas[nuevo];
    await tx(async t => {
      await t.run('UPDATE productos SET nombre=?,autor=?,editorial=?,descripcion=? WHERE id=?', nuevo, f[1], f[2], f[10], p.id);
      await t.run('DELETE FROM imagenes_producto WHERE producto_id=?', p.id); // la portada vieja ya no corresponde
    });
    cambios++;
  }
  for (const f of Object.values(filas)) {
    if (await one('SELECT 1 AS x FROM productos WHERE nombre=?', f[0])) continue;
    await run(`INSERT INTO productos(categoria_id,nombre,autor,editorial,precio,stock,color,tinte,tinte_texto,preventa,destacado,descripcion)
               VALUES ((SELECT id FROM categorias WHERE codigo=?),?,?,?,?,?,?,?,?,?,0,?)`, f[3], f[0], f[1], f[2], f[4], f[5], f[6], f[7], f[8], f[9], f[10]);
    cambios++;
  }
  // Ofertas (rebajas y packs): se aplican una sola vez por versión; después se editan desde la administración
  const ver = await one("SELECT valor FROM configuracion WHERE clave='catalogo_ofertas'");
  if (!ver || Number(ver.valor) < 2) {
    await tx(async t => {
      await t.run('UPDATE productos SET precio=precio_antes, precio_antes=NULL WHERE precio_antes IS NOT NULL'); // quita las rebajas anteriores
      if ((await cols('productos')).includes('promo')) await t.run('UPDATE productos SET promo=NULL'); // el 3x2 ya no existe
      for (const [n, pct] of Object.entries(REBAJAS)) await t.run('UPDATE productos SET precio_antes=precio, precio=ROUND(precio*?,2) WHERE nombre=? AND precio_antes IS NULL', 1 - pct / 100, n);
      await t.run('DELETE FROM pack_items');
      await t.run('DELETE FROM packs');
      for (const [i, [n, pct, prods]] of PACKS.entries()) {
        await t.run('INSERT INTO packs(id,nombre,descuento_pct) VALUES (?,?,?)', i + 1, n, pct);
        for (const pn of prods) await t.run('INSERT INTO pack_items(pack_id,producto_id) VALUES (?,(SELECT id FROM productos WHERE nombre=?))', i + 1, pn);
      }
      await t.run("INSERT OR REPLACE INTO configuracion(clave,valor,detalle) VALUES ('catalogo_ofertas',2,'Versión de las ofertas aplicadas al catálogo (uso interno)')");
    });
    console.log('Ofertas del catálogo aplicadas (rebajas y packs).');
  }
  if (cambios) console.log(`Catálogo actualizado: ${cambios} producto(s).`);
}

// Páginas de la tienda (cada una es un archivo HTML independiente) y la hoja de estilos.
// Aplicación de administración (CRUD de productos, stock y pedidos): /admin/
const ADMIN = require('./admin')({ q, one, run, tx, HttpError, dbError, limitar, enviarComprobante });
Object.assign(rutas, ADMIN.rutas);
const PAGINAS_HTML = ['index', 'ofertas', 'catalogo', 'producto', 'favoritos', 'pedidos', 'pagar', 'ingresar', 'perfil', 'ayuda'];
const ESTATICOS = { '/': 'index.html', '/css/estilos.css': 'css/estilos.css', '/admin': 'admin/index.html', '/admin/': 'admin/index.html', '/admin/admin.js': 'admin/admin.js', ...Object.fromEntries(PAGINAS_HTML.map(p => ['/' + p + '.html', p + '.html'])) };
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function leerCuerpo(req) {
  return new Promise((ok, fail) => {
    let s = '', grande = false;
    req.on('data', c => { if (grande) return; s += c; if (s.length > 100_000) { grande = true; req.__grande = true; fail(new HttpError(413, { error: 'Solicitud demasiado grande.' })); } });
    req.on('end', () => { try { const v = s && !grande ? JSON.parse(s) : {}; ok(v && typeof v === 'object' && !Array.isArray(v) ? v : {}); } catch { fail(new HttpError(400, { error: 'JSON no válido.' })); } });
  });
}
function enviar(res, status, body, tipo = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
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
      const r = await handler({ req, body, params, query: url.searchParams, user: await usuarioDe(req) });
      if (req.method !== 'GET' && /^\/api\/(pedidos|comentarios|pagos|admin)/.test(url.pathname)) bootPublico = null; // algo del catálogo pudo cambiar (stock, comentarios, packs): la próxima visita recalcula
      if (r && r.__html) return enviar(res, 200, r.__html, 'text/html; charset=utf-8');
      if (r && r.__redirect) { res.writeHead(302, { Location: r.__redirect }); return res.end(); }
      return enviar(res, 200, r);
    }
    const mp = url.pathname.match(/^\/pago\/([0-9a-f]{48})(\/app)?$/);
    if (mp) {
      limitar(req, 'pagopag', 60, 60000);
      await expirarPendientes();
      const p = await pagoPorToken(mp[1]);
      if (!p || p.metodo === 'fisico') return enviar(res, 404, paginaPago('No encontrado', '<div class="card"><h1 style="margin-top:0">Pago no encontrado</h1><p>Este enlace de pago no existe.</p><a class="btn" href="/">IR A LA TIENDA</a></div>'), 'text/html; charset=utf-8');
      return enviar(res, 200, p.estado !== 'pendiente' ? paginaEstadoPago(p) : mp[2] ? paginaApp(p) : paginaPasarela(p), 'text/html; charset=utf-8');
    }
    const mi = url.pathname.match(/^\/img\/([a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp))$/);
    if (mi) {
      const f = path.join(IMG_DIR, mi[1]);
      if (!fs.existsSync(f)) return enviar(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
      res.writeHead(200, { 'Content-Type': TIPOS_IMG[path.extname(f).toLowerCase()], 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(f));
    }
    const m = url.pathname.match(/^\/js\/(model|view|controller|rules)\.js$/);
    const file = ESTATICOS[url.pathname] || (m && 'js/' + m[1] + '.js');
    if (!file) return enviar(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    enviar(res, 200, fs.readFileSync(path.join(ROOT, file)), TIPOS[path.extname(file)]);
  } catch (e) {
    if (req.method !== 'GET' && /^\/api\/(pedidos|comentarios|pagos|admin)/.test(url.pathname)) bootPublico = null;
    if (req.__grande) { res.setHeader('Connection', 'close'); res.on('finish', () => req.destroy()); } // se responde 413 y después se corta la subida
    if (e instanceof HttpError) return enviar(res, e.status, e.body);
    console.error(e); enviar(res, 500, { error: 'Error del servidor.' });
  }
});

// Arranque: primero se abre la base de datos y luego se atienden las peticiones.
(async () => {
  db = await openDb();
  D = mk(db);
  await ADMIN.preparar();
  await actualizarCatalogo();
  if (process.env.GOOGLE_CLIENT_ID) claveGoogle('').catch(() => {}); // deja las claves de Google listas
  await sincronizarImagenes();
  server.listen(PORT, '0.0.0.0', () => console.log(`STELLAR VAULT en http://localhost:${PORT}`));
  // Render (plan gratis) apaga la tienda tras 15 min sin visitas: se visita a sí misma cada 10 min para seguir activa.
  const publica = process.env.RENDER_EXTERNAL_URL;
  if (publica) setInterval(() => fetch(publica + '/api/health').catch(() => {}), 10 * 60000);
})().catch(e => { console.error('No se pudo iniciar la base de datos:', e); process.exit(1); });

