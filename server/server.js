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
// Perfil completo que el navegador necesita (la foto subida tiene prioridad sobre la de Google).
const perfilDe = id => {
  const u = one(`SELECT u.id,u.nombre,u.email,u.registro,u.telefono,u.direccion,u.foto_google,u.foto_subida,p.nombre AS prov,c.nombre AS city
                 FROM usuarios u LEFT JOIN provincias p ON p.id=u.provincia_id LEFT JOIN ciudades c ON c.id=u.ciudad_id WHERE u.id=?`, id);
  return u && { id: u.id, nombre: u.nombre, email: u.email, registro: u.registro, telefono: u.telefono || '', prov: u.prov || '', city: u.city || '', addr: u.direccion || '',
    foto: u.foto_subida || u.foto_google || null, fotoGoogle: u.foto_google || null, fotoSubida: !!u.foto_subida };
};
const publico = u => perfilDe(u.id);

// 0991234567 -> +593 99 123 4567 (los fijos quedan como +593 2 123 4567)
function formatTel(d) {
  const n = String(d || '').replace(/\D/g, '').replace(/^0/, '');
  if (!n) return '';
  return '+593 ' + (n.length === 9 ? n.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3') : n.replace(/^(\d)(\d{3})(\d{4})$/, '$1 $2 $3'));
}

function pedidosDe(where, ...args) {
  return q(`SELECT * FROM pedidos WHERE ${where} ORDER BY id`, ...args).map(p => {
    const items = q(`SELECT i.producto_id id,pr.nombre n,i.cantidad q,i.precio_unitario pr FROM pedido_items i JOIN productos pr ON pr.id=i.producto_id WHERE i.pedido_id=?`, p.id);
    return {
      id: p.id, no: p.numero, date: p.fecha, paid: !!p.pagado, estado: p.estado, email: p.email, total: p.total, items,
      name: p.nombre, tel: formatTel(p.telefono),
      dm: p.entrega === 'retiro' ? 'Retiro en tienda' : 'Envío por Servientrega',
      method: p.metodo_pago === 'deuna' ? 'DeUna' : 'Pago en físico (efectivo)',
      units: items.reduce((a, i) => a + i.q, 0),
    };
  });
}

/* ================= Pagos con DeUna (SIMULACIÓN) =================
   Flujo igual al de una pasarela real: el pedido se crea "pendiente_pago" -> el cliente va a la pantalla de pago
   (botón o QR) -> confirma en la "app DeUna" simulada -> vuelve a la tienda con el resultado.
   Solo si el pago se aprueba se marca el pedido como pagado y se envía el comprobante por correo.
   Con una pasarela real (dLocal, DeUna Negocios, etc.) solo cambiarían crearPago/aprobarPago: la pasarela
   avisaría por un webhook firmado en lugar de las pantallas simuladas de abajo. */
const MIN_PAGO = 15;
const dinero = n => '$' + Number(n).toFixed(2);
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pagoPorToken = t => one('SELECT pg.*,pe.numero,pe.email FROM pagos pg JOIN pedidos pe ON pe.id=pg.pedido_id WHERE pg.token=?', String(t || ''));

function cerrarPago(pagoId, pedidoId, estado, motivo) {
  tx(db, () => {
    run("UPDATE pagos SET estado=?,motivo=?,resuelto=? WHERE id=? AND estado='pendiente'", estado, motivo, new Date().toISOString(), pagoId);
    run("UPDATE pedidos SET estado='cancelado' WHERE id=? AND estado='pendiente_pago'", pedidoId); // el trigger devuelve el stock
  });
}
function expirarPendientes() {
  const ahora = new Date().toISOString();
  q("SELECT id,pedido_id FROM pagos WHERE estado='pendiente' AND metodo<>'fisico' AND expira<?", ahora)
    .forEach(p => cerrarPago(p.id, p.pedido_id, 'expirado', 'El tiempo para pagar venció.'));
}
setInterval(() => { try { expirarPendientes(); } catch (e) { console.error(e); } }, 60000).unref();

async function enviarComprobante(pedidoId) {
  const p = one(`SELECT pe.*,pr.nombre AS prov,ci.nombre AS city FROM pedidos pe LEFT JOIN provincias pr ON pr.id=pe.provincia_id LEFT JOIN ciudades ci ON ci.id=pe.ciudad_id WHERE pe.id=?`, pedidoId);
  const items = q('SELECT pr.nombre n,i.cantidad q,i.precio_unitario pu FROM pedido_items i JOIN productos pr ON pr.id=i.producto_id WHERE i.pedido_id=?', pedidoId);
  const pagado = !!p.pagado, unidades = items.reduce((a, i) => a + i.q, 0);
  const fila = (k, v) => `<tr><td style="padding:9px 0;color:#6b5a6e;border-bottom:1px solid #f3e7ec">${k}</td><td style="padding:9px 0;text-align:right;font-weight:700;border-bottom:1px solid #f3e7ec">${v}</td></tr>`;
  const detalle = items.map(i => `${escHtml(i.n)} × ${i.q} · ${dinero(i.pu * i.q)}`).join('<br>');
  const entrega = p.entrega === 'retiro' ? 'Retiro en tienda (Quito)' : 'Envío por Servientrega<br><span style="font-weight:400;color:#6b5a6e">' + escHtml([p.direccion, p.city, p.prov].filter(Boolean).join(', ')) + '</span>';
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #f3d9e1;border-radius:14px;padding:24px;color:#2a1a2e">
    <h2 style="color:#d6204f;margin:0 0 2px">STELLAR VAULT</h2>
    <p style="margin:0 0 16px;color:#6b5a6e">Hola <b>${escHtml(p.nombre)}</b>, ${pagado ? 'recibimos tu pago. ¡Gracias por tu compra!' : 'registramos tu pedido. ¡Gracias por tu compra!'} Guarda este correo como constancia.</p>
    <div style="border:1px solid #f3d9e1;border-radius:12px;padding:6px 18px 14px">
      <table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:12px 0;font-size:17px;font-weight:700">Comprobante</td><td style="text-align:right;font-weight:700;font-size:12px;color:${pagado ? '#15803d' : '#b45309'}">${pagado ? 'PAGADO' : 'PAGO PENDIENTE'}</td></tr>
      ${fila('N.º de pedido', escHtml(p.numero))}
      ${fila('Fecha', new Date(p.fecha).toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' }))}
      ${fila('Cliente', escHtml(p.nombre))}
      ${fila('Teléfono', escHtml(formatTel(p.telefono)))}
      ${fila('Correo', escHtml(p.email))}
      ${fila('Método de pago', p.metodo_pago === 'deuna' ? 'DeUna' : 'Pago en físico (efectivo)')}
      ${fila('Entrega', entrega)}
      ${fila('Artículos (' + unidades + ' unidad' + (unidades > 1 ? 'es' : '') + ')', detalle)}
      ${fila('Subtotal', dinero(p.subtotal))}
      ${fila(p.entrega === 'retiro' ? 'Retiro en tienda' : 'Envío', dinero(p.envio))}
      <tr><td style="padding:12px 0 0;color:#6b5a6e">${pagado ? 'Total pagado' : 'Total a pagar'}</td><td style="padding:12px 0 0;text-align:right;font-weight:800;font-size:18px">${dinero(p.total)} USD</td></tr></table></div>
    <p style="font-size:13px;color:#6b5a6e;margin:16px 0 0">¿Dudas con tu pedido? Escríbenos a <b>santiagoquiguango@hotmail.com</b> o llama al <b>096368732</b>.</p>
    <p style="font-size:11px;color:#9a8a9d;margin:14px 0 0">Este documento es un comprobante de compra de demostración y no reemplaza una factura electrónica autorizada por el SRI.</p></div>`;
  await enviarCorreo({ to: p.email, subject: `${pagado ? 'Comprobante de pago' : 'Comprobante de pedido'} ${p.numero} · STELLAR VAULT`, html, enlace: '(comprobante)' });
}

async function aprobarPago(token) {
  expirarPendientes();
  const p = pagoPorToken(token);
  if (!p || p.metodo === 'fisico') throw new HttpError(404, { error: 'Pago no encontrado.' });
  const n = p.numero.slice(1);
  if (p.estado === 'aprobado') return { redirect: `/?pago=ok&n=${n}` };
  if (p.estado !== 'pendiente') return { redirect: `/?pago=error&n=${n}&m=${p.estado === 'expirado' ? 'expirado' : 'cancelado'}` };
  tx(db, () => {
    run("UPDATE pagos SET estado='aprobado',resuelto=? WHERE id=?", new Date().toISOString(), p.id);
    run("UPDATE pedidos SET pagado=1,estado='confirmado' WHERE id=?", p.pedido_id);
  });
  enviarComprobante(p.pedido_id).catch(e => console.error('No se pudo enviar el comprobante:', e.message));
  return { redirect: `/?pago=ok&n=${n}` };
}
function rechazarPago(token, motivo) {
  expirarPendientes();
  const p = pagoPorToken(token);
  if (!p || p.metodo === 'fisico') throw new HttpError(404, { error: 'Pago no encontrado.' });
  const n = p.numero.slice(1), m = motivo === 'saldo' ? 'saldo' : 'cancelado';
  if (p.estado === 'pendiente') cerrarPago(p.id, p.pedido_id, m === 'saldo' ? 'rechazado' : 'cancelado', m === 'saldo' ? 'Saldo insuficiente en la cuenta DeUna.' : 'El cliente canceló el pago.');
  return { redirect: p.estado === 'aprobado' ? `/?pago=ok&n=${n}` : `/?pago=error&n=${n}&m=${p.estado === 'expirado' ? 'expirado' : m}` };
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
      const r = run("INSERT INTO usuarios(nombre,email,password_hash,verificado,registro) VALUES (?,?,?,1,'google')", nombre, email, hashPassword(crypto.randomBytes(24).toString('hex')));
      u = { id: Number(r.lastInsertRowid), nombre, email };
    } else run('UPDATE usuarios SET verificado=1 WHERE id=?', u.id); // Google ya comprobó que el correo es suyo
    const pic = String(info.picture || ''); // la foto de Google se sincroniza en cada inicio de sesión
    if (pic.startsWith('https://') && pic.length < 500) run('UPDATE usuarios SET foto_google=? WHERE id=?', pic, u.id);
    return { token: sesion(u.id), usuario: publico(u) };
  },
  // Perfil: el usuario edita sus datos y su foto (la foto de Google se sincroniza al iniciar sesión con Google).
  'PUT /api/perfil': ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para editar tu perfil.');
    const d = { nombre: String(body.nombre || '').trim(), telefono: String(body.telefono || '').trim(), addr: String(body.addr || '').trim() };
    const err = validar(reglas(), 'perfil', d);
    if (d.nombre.length > 80) err.nombre = 'El nombre no puede pasar de 80 caracteres.';
    let pid = null, cid = null;
    const prov = String(body.prov || ''), city = String(body.city || '');
    if (prov || city) {
      const pr = one('SELECT id FROM provincias WHERE nombre=?', prov);
      const ci = pr && one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, city);
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
      run('UPDATE usuarios SET nombre=?,telefono=?,provincia_id=?,ciudad_id=?,direccion=? WHERE id=?', d.nombre, d.telefono.replace(/\D/g, '') || null, pid, cid, d.addr || null, user.id);
      if (foto !== undefined) run('UPDATE usuarios SET foto_subida=? WHERE id=?', foto, user.id);
    } catch (e) { throw dbError(e); }
    return { usuario: perfilDe(user.id) };
  },
  'POST /api/perfil/password': ({ body, user }) => {
    exigirSesion(user, 'Inicia sesión para cambiar tu contraseña.');
    const u = one('SELECT password_hash,registro FROM usuarios WHERE id=?', user.id);
    if (u.registro === 'google') throw new HttpError(400, { error: 'Tu cuenta entra con Google y no tiene contraseña en la tienda.' });
    const nueva = String(body.nueva || ''), actual = String(body.actual || '');
    if (actual.length > 128 || nueva.length > 128) throw new HttpError(422, { error: 'La contraseña no puede pasar de 128 caracteres.' });
    if (!checkPassword(actual, u.password_hash)) throw new HttpError(401, { error: 'La contraseña actual no es correcta.' });
    const err = validar(reglas(), 'clave', { nueva });
    if (err.nueva) throw new HttpError(422, { error: err.nueva });
    run('UPDATE usuarios SET password_hash=? WHERE id=?', hashPassword(nueva), user.id);
    return { ok: true };
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
  'GET /api/pagos/estado': ({ query }) => {
    expirarPendientes();
    const p = pagoPorToken(query.get('t'));
    return p ? { estado: p.estado, numero: p.numero.slice(1) } : { estado: 'desconocido' };
  },
  'POST /api/pagos/:token/confirmar': async ({ params }) => aprobarPago(params.token),
  'POST /api/pagos/:token/rechazar': ({ params, body }) => rechazarPago(params.token, body.motivo),
  'GET /api/pedidos/estado': ({ query, user }) => {
    exigirSesion(user, 'Inicia sesión para ver tu pedido.');
    const ped = pedidosDe('usuario_id=? AND numero=?', user.id, '#' + String(query.get('n') || ''))[0];
    if (!ped) throw new HttpError(404, { error: 'Pedido no encontrado.' });
    return { pedido: ped };
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
    // Un pedido nuevo reemplaza los pagos DeUna que el usuario dejó sin terminar (así no se retiene stock).
    q("SELECT pg.id,pg.pedido_id FROM pagos pg JOIN pedidos pe ON pe.id=pg.pedido_id WHERE pe.usuario_id=? AND pg.estado='pendiente' AND pg.metodo<>'fisico'", user.id)
      .forEach(x => cerrarPago(x.id, x.pedido_id, 'cancelado', 'Reemplazado por un pedido nuevo.'));
    const c = cfg();
    const subtotal = Math.round(items.reduce((a, i) => a + i.prod.precio * i.q, 0) * 100) / 100;
    const envio = dm === 'pick' || subtotal >= c.envio_gratis_desde ? 0 : c.envio_costo;
    try {
      const out = tx(db, () => {
        let numero; do { numero = '#SV-2026-' + (1000 + crypto.randomInt(9000)); } while (one('SELECT 1 FROM pedidos WHERE numero=?', numero));
        const pr = dm === 'ship' ? one('SELECT id FROM provincias WHERE nombre=?', String(d.prov)) : null;
        const ci = pr ? one('SELECT id FROM ciudades WHERE provincia_id=? AND nombre=?', pr.id, String(d.city)) : null;
        const r = run(`INSERT INTO pedidos(numero,usuario_id,nombre,telefono,email,entrega,metodo_pago,provincia_id,ciudad_id,direccion,tipo_vivienda,edificio,piso,unidad,referencia,subtotal,envio,total,pagado)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          numero, user.id, String(d.name).trim(), String(d.tel).replace(/\D/g, ''), String(d.email).trim(), dm === 'pick' ? 'retiro' : 'envio', body.metodo,
          pr && pr.id, ci && ci.id, dm === 'ship' ? String(d.addr).trim() : null, dm === 'ship' ? (d.type || 'Casa') : 'Casa',
          dm === 'ship' ? d.edif || null : null, dm === 'ship' && d.type !== 'Casa' ? String(d.piso).trim() : null, dm === 'ship' && d.type !== 'Casa' ? String(d.unit).trim() : null,
          dm === 'ship' ? d.ref || null : null, subtotal, envio, Math.round((subtotal + envio) * 100) / 100, 0);
        items.forEach(i => run('INSERT INTO pedido_items(pedido_id,producto_id,cantidad,precio_unitario) VALUES (?,?,?,?)', Number(r.lastInsertRowid), i.prod.id, i.q, i.prod.precio));
        const pid = Number(r.lastInsertRowid), totalPed = Math.round((subtotal + envio) * 100) / 100;
        let pago = null;
        if (body.metodo === 'deuna') {
          const tok = crypto.randomBytes(24).toString('hex'), expira = new Date(Date.now() + MIN_PAGO * 60000).toISOString();
          run("UPDATE pedidos SET estado='pendiente_pago' WHERE id=?", pid);
          run('INSERT INTO pagos(pedido_id,token,metodo,monto,expira) VALUES (?,?,?,?,?)', pid, tok, body.canal === 'qr' ? 'deuna_qr' : 'deuna_boton', totalPed, expira);
          pago = { token: tok, url: '/pago/' + tok, expira };
        } else {
          run("INSERT INTO pagos(pedido_id,token,metodo,monto,estado,expira) VALUES (?,?,'fisico',?,'pendiente',?)", pid, crypto.randomBytes(24).toString('hex'), totalPed, new Date().toISOString());
        }
        return { pedido: pedidosDe('id=?', pid)[0], pago };
      });
      if (!out.pago) enviarComprobante(out.pedido.id).catch(e => console.error('No se pudo enviar el comprobante:', e.message));
      return out;
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
    const mp = url.pathname.match(/^\/pago\/([0-9a-f]{48})(\/app)?$/);
    if (mp) {
      limitar(req, 'pagopag', 60, 60000);
      expirarPendientes();
      const p = pagoPorToken(mp[1]);
      if (!p || p.metodo === 'fisico') return enviar(res, 404, paginaPago('No encontrado', '<div class="card"><h1 style="margin-top:0">Pago no encontrado</h1><p>Este enlace de pago no existe.</p><a class="btn" href="/">IR A LA TIENDA</a></div>'), 'text/html; charset=utf-8');
      return enviar(res, 200, p.estado !== 'pendiente' ? paginaEstadoPago(p) : mp[2] ? paginaApp(p) : paginaPasarela(p), 'text/html; charset=utf-8');
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
