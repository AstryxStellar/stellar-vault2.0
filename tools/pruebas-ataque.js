// Pruebas de ataque (161 comprobaciones) contra una COPIA LOCAL de la tienda con una base de datos temporal. NO usar contra la página en línea.
// 1) En otra terminal:  $env:PORT='3100'; $env:DB_PATH='C:\temp\prueba.db'; $env:ADMIN_CLAVE='clave-ataque-local'; node server/server.js
// 2) Aquí:             node tools/pruebas-ataque.js http://localhost:3100
const net = require('net');
const BASE = process.argv[2] || 'http://localhost:3100';
const U = new URL(BASE);
const res = []; let contador = 0;
const ok = (n, cond, det = '') => { res.push([cond ? 'OK ' : 'FALLA', n, det]); };
const j = async (m, p, body, h = {}) => {
  let r;
  contador++; // cada petición de prueba sale con una IP distinta para no chocar con el límite de intentos (salvo la sección 11)
  try { r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.' + (contador >> 8 & 255) + '.' + (contador & 255) + '.1', ...h }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }); }
  catch (e) { return { s: 0, d: 'ERR ' + (e.cause && e.cause.code || e.message) }; }
  let d = null; const t = await r.text(); try { d = JSON.parse(t); } catch { d = t; }
  return { s: r.status, d };
};
const raw = (txt, espera = 1500) => new Promise(ok2 => {
  const s = net.connect(U.port, U.hostname); let buf = '';
  s.on('data', c => buf += c); s.on('error', () => ok2('ERROR')); s.on('close', () => ok2(buf));
  s.write(txt); setTimeout(() => { s.destroy(); ok2(buf); }, espera);
});
const vivo = async () => { try { return (await j('GET', '/api/health')).s === 200; } catch { return false; } };
const XFF = ip => ({ 'X-Forwarded-For': ip });

(async () => {
  // ---------- 1. Peticiones mal formadas (¿se cae el servidor?) ----------
  const malas = [
    'GET //[ HTTP/1.1\r\nHost: x\r\n\r\n', 'GET /%E0%A4%A HTTP/1.1\r\nHost: x\r\n\r\n', 'GET http://[::1 HTTP/1.1\r\nHost: x\r\n\r\n',
    'GET /api/bootstrap?' + 'a=1&'.repeat(20000) + ' HTTP/1.1\r\nHost: x\r\n\r\n', 'GET /' + 'A'.repeat(100000) + ' HTTP/1.1\r\nHost: x\r\n\r\n',
    'POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Length: 99999999\r\n\r\n{', 'POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 5\r\n\r\n{bad}',
    'GET /api/%00 HTTP/1.1\r\nHost: x\r\n\r\n', 'BREW /api/health HTTP/1.1\r\nHost: x\r\n\r\n', 'GET /api/health HTTP/9.9\r\nHost: x\r\n\r\n',
  ];
  for (const [i, m] of malas.entries()) { await raw(m, 800); ok(`petición mal formada #${i + 1} no tumba el servidor`, await vivo()); }
  for (const body of ['{', 'null', '[]', '"texto"', '123', '{"email":{"$ne":1}}', '{"email":["a"],"password":["b"]}']) {
    const r = await j('POST', '/api/login', body); ok('login con cuerpo raro ' + body.slice(0, 20) + ' → no 500', r.s < 500, 'estado ' + r.s);
  }
  ok('servidor sigue vivo tras cuerpos raros', await vivo());

  // ---------- 2. Rutas protegidas sin sesión ----------
  for (const [m, p] of [['GET', '/api/pedidos'], ['GET', '/api/favoritos'], ['POST', '/api/favoritos'], ['PUT', '/api/perfil'], ['POST', '/api/pedidos'], ['POST', '/api/comentarios'], ['DELETE', '/api/comentarios/1'], ['GET', '/api/pedidos/estado?n=SV-2026-1001'],
    ['GET', '/api/admin/productos'], ['GET', '/api/admin/pedidos'], ['POST', '/api/admin/productos'], ['DELETE', '/api/admin/productos/1'], ['POST', '/api/admin/pedidos/1/accion'], ['GET', '/api/admin/packs'], ['PUT', '/api/admin/packs/1']]) {
    const r = await j(m, p, m === 'GET' || m === 'DELETE' ? undefined : {}); ok(`sin sesión ${m} ${p} → 401`, r.s === 401, 'estado ' + r.s);
  }
  for (const t of ['x', 'a'.repeat(64), "' OR 1=1 --", '../../etc/passwd', 'undefined', 'null']) { const r = await j('GET', '/api/admin/resumen', undefined, { 'X-Admin-Token': t }); ok('token de admin falso rechazado: ' + t.slice(0, 12), r.s === 401); }
  { const r = await j('GET', '/api/yo', undefined, { Authorization: 'Bearer ' + 'a'.repeat(64) }); ok('token de usuario falso → sin usuario', r.s === 200 && !r.d.usuario); }

  // ---------- 3. Inyección SQL ----------
  for (const e of ["' OR '1'='1", "admin'--", "a@b.com'; DROP TABLE usuarios;--"]) { const r = await j('POST', '/api/login', { email: e, password: "' OR '1'='1" }); ok('inyección SQL en login: ' + e.slice(0, 16), r.s >= 400 && r.s < 500 && !(r.d && r.d.token), 'estado ' + r.s); }
  { const r = await j('GET', '/api/pagos/estado?t=' + encodeURIComponent("' OR 1=1--")); ok('inyección SQL en token de pago', r.s === 200 && r.d.estado === 'desconocido'); }
  { const r = await j('GET', '/api/health'); ok('tablas intactas tras inyecciones', r.s === 200 && r.d.productos > 0); }

  // ---------- 4. Sesión de prueba ----------
  const L = await j('POST', '/api/login', { email: 'ana.perez@correo.com', password: 'Demo1234' });
  ok('login de usuario de prueba', L.s === 200 && L.d.token);
  const A = { Authorization: 'Bearer ' + L.d.token };
  const L2 = await j('POST', '/api/login', { email: 'luis.andrade@correo.com', password: 'Demo1234' }); const B = { Authorization: 'Bearer ' + L2.d.token };
  const boot = (await j('GET', '/api/bootstrap')).d; const P = boot.productos; const por = n => P.find(p => p.name === n);

  // ---------- 5. XSS guardado (el texto debe viajar como dato; la pantalla lo escapa) ----------
  const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  { const r = await j('POST', '/api/comentarios', { producto_id: P[0].id, texto: xss, calificacion: 5 }, A); ok('comentario con HTML se guarda como texto (el cliente lo escapa)', r.s === 200 || r.s === 422, 'estado ' + r.s); }
  { const r = await j('PUT', '/api/perfil', { nombre: xss.slice(0, 40), telefono: '0963687320', addr: 'Calle falsa 123' }, A); ok('perfil con HTML no rompe', r.s < 500, 'estado ' + r.s); }
  for (const [n, body] of [['calificación 99', { producto_id: P[0].id, texto: 'hola mundo', calificacion: 99 }], ['calificación texto', { producto_id: P[0].id, texto: 'hola mundo', calificacion: 'x' }], ['producto inexistente', { producto_id: 999999, texto: 'hola mundo', calificacion: 3 }], ['texto de 100 KB', { producto_id: P[0].id, texto: 'x'.repeat(100000), calificacion: 3 }]]) {
    const r = await j('POST', '/api/comentarios', body, A); ok('comentario inválido rechazado: ' + n, r.s >= 400 && r.s < 500, 'estado ' + r.s);
  }

  // ---------- 6. Permisos entre usuarios ----------
  const com = (await j('GET', '/api/comentarios')).d.comentarios; const ajeno = com.find(c => c.uid !== L.d.usuario.id);
  { const r = await j('DELETE', '/api/comentarios/' + ajeno.id, undefined, A); ok('no se puede borrar el comentario de otro usuario', r.s === 403, 'estado ' + r.s); }
  { const mio = (await j('GET', '/api/pedidos', undefined, B)).d.pedidos[0]; const r = await j('GET', '/api/pedidos/estado?n=' + mio.no.slice(1), undefined, A); ok('no se puede ver el pedido de otro usuario', r.s === 404, 'estado ' + r.s); }
  { const r = await j('PUT', '/api/perfil', { nombre: 'Ana Pérez', telefono: '0963687320', addr: 'Calle falsa 123', email: 'otro@x.com', verificado: 1, id: 2, password_hash: 'x' }, A); const yo = (await j('GET', '/api/yo', undefined, A)).d.usuario; ok('perfil ignora campos extra (email/id)', yo.email === 'ana.perez@correo.com' && yo.id === L.d.usuario.id); }

  // ---------- 7. Pedidos: manipulación ----------
  const dat = { name: 'Ana Pérez', tel: '0963687320', email: 'ana.perez@correo.com' };
  const pedir = (items, extra = {}) => j('POST', '/api/pedidos', { dm: 'pick', metodo: 'fisico', items, datos: dat, ...extra }, A);
  const prod = P.find(p => !p.pre && p.stock >= 3 && p.cat === 'm');
  const casos = [['cantidad negativa', [{ id: prod.id, q: -5 }]], ['cantidad 0', [{ id: prod.id, q: 0 }]], ['cantidad decimal', [{ id: prod.id, q: 1.5 }]], ['cantidad texto', [{ id: prod.id, q: 'abc' }]], ['cantidad gigante', [{ id: prod.id, q: 1e9 }]], ['más que el stock', [{ id: prod.id, q: prod.stock + 1 }]],
    ['producto inexistente', [{ id: 999999, q: 1 }]], ['carrito vacío', []], ['items no es lista', 'hola'], ['51 productos distintos', P.slice(0, 51).map(p => ({ id: p.id, q: 1 }))], ['id como objeto', [{ id: { a: 1 }, q: 1 }]], ['precio manipulado (se ignora)', [{ id: prod.id, q: 1, precio: 0.01, price: 0.01 }]]];
  for (const [n, it] of casos) { const r = await pedir(it); const esperado = n.startsWith('precio manipulado'); ok('pedido: ' + n, esperado ? (r.s === 200 && Math.abs(r.d.pedido.total - prod.price) < 0.01) : r.s >= 400 && r.s < 500, 'estado ' + r.s + (r.d && r.d.pedido ? ' total ' + r.d.pedido.total : '')); }
  { const r = await pedir([{ id: prod.id, q: 1 }, { id: prod.id, q: 1 }]); ok('mismo producto repetido en la lista → no 500', r.s < 500, 'estado ' + r.s + ' ' + JSON.stringify(r.d).slice(0, 80)); }
  { const r = await pedir([{ id: prod.id, q: 1 }], { metodo: 'bitcoin' }); ok('método de pago inventado rechazado', r.s === 422); }
  { const r = await j('POST', '/api/pedidos', { dm: 'ship', metodo: 'fisico', items: [{ id: prod.id, q: 1 }], datos: { ...dat, prov: 'Atlantis', city: 'Quito', addr: 'Calle 1234' } }, A); ok('provincia falsa rechazada', r.s === 422); }
  { const r = await j('POST', '/api/pedidos', { dm: 'pick', metodo: 'fisico', items: [{ id: prod.id, q: 1 }], datos: { name: xss, tel: '123', email: 'no-es-correo' } }, A); ok('datos de entrega inválidos rechazados', r.s === 422); }
  // pack: descuento no puede dejar total <= 0 ni negativo; duplicados no multiplican el descuento
  const pk = boot.packs[0]; const itemsPack = pk.items.map(id => ({ id, q: 1 }));
  { const r = await pedir([...itemsPack, ...itemsPack]); const esperado = pk.items.reduce((a, id) => a + P.find(p => p.id === id).price, 0) * 2 * (100 - pk.pct) / 100; ok('pack repetido: descuento correcto', r.s === 200 ? Math.abs(r.d.pedido.total - esperado) < 0.02 : r.s < 500, 'estado ' + r.s + (r.d.pedido ? ` total ${r.d.pedido.total} esperado ${esperado.toFixed(2)}` : '')); }

  // ---------- 8. Stock: compras simultáneas de la última unidad ----------
  const uno = P.find(p => !p.pre && p.stock >= 1 && p.cat === 'f');
  const antes = (await j('GET', '/api/bootstrap')).d.productos.find(p => p.id === uno.id).stock;
  const rs = await Promise.all(Array.from({ length: antes + 8 }, () => pedir([{ id: uno.id, q: 1 }])));
  const exitos = rs.filter(r => r.s === 200).length; const despues = (await j('GET', '/api/bootstrap')).d.productos.find(p => p.id === uno.id).stock;
  ok(`compras simultáneas: stock ${antes} → ${despues}, pedidos aceptados ${exitos}`, exitos <= antes && despues >= 0 && despues === antes - exitos, '5xx: ' + rs.filter(r => r.s >= 500).length);
  ok('sin errores 500 en la carrera de stock', rs.every(r => r.s < 500), rs.filter(r => r.s >= 500).map(r => JSON.stringify(r.d)).slice(0, 2).join(' '));

  // ---------- 9. Pagos DeUna ----------
  { const r = await pedir([{ id: prod.id, q: 1 }], { metodo: 'deuna', canal: 'qr' }); const tok = r.d.pago && r.d.pago.token; ok('pedido DeUna crea pago pendiente', r.s === 200 && tok);
    const e1 = await j('GET', '/api/pagos/estado?t=' + tok); ok('estado pendiente', e1.d.estado === 'pendiente');
    const c1 = await j('POST', `/api/pagos/${tok}/confirmar`, {}); const c2 = await j('POST', `/api/pagos/${tok}/confirmar`, {}); const rc = await j('POST', `/api/pagos/${tok}/rechazar`, { motivo: 'saldo' });
    ok('confirmar dos veces / rechazar después no rompe', c1.s < 500 && c2.s < 500 && rc.s < 500, `${c1.s}/${c2.s}/${rc.s}`);
    const fin = await j('GET', '/api/pagos/estado?t=' + tok); ok('un pago aprobado no se puede revertir', fin.d.estado === 'aprobado', fin.d.estado);
    for (const t of ['x', 'g'.repeat(48), '0'.repeat(48)]) { const rr = await j('POST', `/api/pagos/${t}/confirmar`, {}); ok('token de pago inventado rechazado', rr.s === 404, 'estado ' + rr.s); } }

  // ---------- 9b. Identificadores raros y registro ----------
  for (const [m, p, b] of [['DELETE', '/api/comentarios/abc'], ['DELETE', '/api/comentarios/-1'], ['DELETE', '/api/comentarios/1e999'], ['DELETE', '/api/favoritos/xyz'], ['POST', '/api/favoritos', { producto_id: 'x' }], ['POST', '/api/favoritos', { producto_id: { a: 1 } }], ['POST', '/api/favoritos', { producto_id: [1, 2] }],
    ['GET', '/api/pedidos/estado?n=' + '9'.repeat(5000)], ['GET', '/api/pagos/estado?t[]=1'], ['GET', '/api/verificar?t=' + 'z'.repeat(64)], ['GET', '/api/verificacion-estado?s=%00'], ['POST', '/api/reenviar', { email: ['a'] }], ['POST', '/api/perfil/password', { actual: {}, nueva: [] }]]) {
    const r = await j(m, p, b, A); ok(`id/dato raro ${m} ${p.slice(0, 40)} → no 500`, r.s < 500, 'estado ' + r.s);
  }
  for (const [n, b] of [['correo inválido', { nombre: 'Pedro Perez', email: 'x', password: 'Abcd1234' }], ['clave de 200 caracteres', { nombre: 'Pedro Perez', email: 'p1@x.com', password: 'A1'.repeat(100) }], ['nombre con HTML largo', { nombre: '<b>'.repeat(500), email: 'p2@x.com', password: 'Abcd1234' }], ['campos como objetos', { nombre: {}, email: [], password: null }], ['correo repetido de usuario existente', { nombre: 'Ana Perez', email: 'ana.perez@correo.com', password: 'Abcd1234' }]]) {
    const r = await j('POST', '/api/registro', b); ok('registro: ' + n + ' → 4xx', r.s >= 400 && r.s < 500, 'estado ' + r.s);
  }

  // ---------- 9c. Administración con sesión de administrador ----------
  const ad = await j('POST', '/api/admin/login', { clave: 'clave-ataque-local' }); const H = { 'X-Admin-Token': ad.d.token }; ok('login de administrador', ad.s === 200 && ad.d.token);
  const nuevoP = (o = {}) => ({ cat: 'm', nombre: 'Prueba ataque ' + Math.random().toString(36).slice(2), autor: 'Autor', editorial: 'Ed', precio: 9.5, stock: 3, descripcion: 'Descripción de prueba larga.', ...o });
  for (const [n, o] of [['precio negativo', { precio: -5 }], ['precio 0', { precio: 0 }], ['precio gigante', { precio: 1e12 }], ['precio texto', { precio: 'gratis' }], ['stock negativo', { stock: -1 }], ['stock decimal', { stock: 1.5 }], ['stock enorme', { stock: 1e9 }], ['categoría inexistente', { cat: 'zzz' }], ['nombre vacío', { nombre: '  ' }], ['nombre de 5000 caracteres', { nombre: 'x'.repeat(5000) }], ['precio anterior menor', { precio_antes: 1 }], ['campos como objetos', { nombre: {}, autor: [], precio: {} }]]) {
    const r = await j('POST', '/api/admin/productos', nuevoP(o), H); ok('admin: producto con ' + n + ' rechazado', r.s >= 400 && r.s < 500, 'estado ' + r.s);
  }
  { const r = await j('POST', '/api/admin/productos', nuevoP({ nombre: "Robert'); DROP TABLE productos;-- <script>alert(1)</script>" }), H); ok('admin: nombre con SQL/HTML se guarda como texto', r.s === 200, 'estado ' + r.s); }
  { const lista = (await j('GET', '/api/admin/productos', undefined, H)).d.productos; ok('tabla productos intacta tras inyección', lista.length >= 93);
    const dup = lista[0]; const r = await j('POST', '/api/admin/productos', nuevoP({ nombre: dup.nombre }), H); ok('admin: nombre repetido → 409', r.s === 409, 'estado ' + r.s);
    const conPedidos = lista.find(p => p.vendidos > 0); const r2 = await j('DELETE', '/api/admin/productos/' + conPedidos.id, undefined, H); ok('admin: no se elimina un producto con pedidos', r2.s === 409, 'estado ' + r2.s);
    const x = lista.find(p => p.stock >= 1 && !p.preventa);
    for (const [n, b] of [['salida mayor al stock', { tipo: 'salida', cantidad: x.stock + 5, motivo: 'prueba' }], ['cantidad 0', { tipo: 'ingreso', cantidad: 0, motivo: 'prueba' }], ['sin motivo', { tipo: 'ingreso', cantidad: 1, motivo: '' }], ['tipo inventado', { tipo: 'regalo', cantidad: 1, motivo: 'prueba' }], ['cantidad texto', { tipo: 'ingreso', cantidad: 'mil', motivo: 'prueba' }], ['ajuste a negativo', { tipo: 'ajuste', cantidad: -(x.stock + 1), motivo: 'prueba' }]]) {
      const r3 = await j('POST', `/api/admin/productos/${x.id}/stock`, b, H); ok('admin stock: ' + n + ' rechazado', r3.s >= 400 && r3.s < 500, 'estado ' + r3.s); }
    const s2 = (await j('GET', '/api/admin/productos', undefined, H)).d.productos.find(p => p.id === x.id).stock; ok('el stock no cambió con movimientos inválidos', s2 === x.stock, `${x.stock} → ${s2}`);
    const rs2 = await Promise.all(Array.from({ length: 10 }, () => j('POST', `/api/admin/productos/${x.id}/stock`, { tipo: 'salida', cantidad: 1, motivo: 'carrera' }, H))); const s3 = (await j('GET', '/api/admin/productos', undefined, H)).d.productos.find(p => p.id === x.id).stock;
    ok(`10 salidas simultáneas: el stock nunca queda negativo (${x.stock} → ${s3})`, s3 >= 0 && rs2.every(r => r.s < 500), 'estados ' + [...new Set(rs2.map(r => r.s))].join(',')); }
  for (const [m, p, b] of [['GET', '/api/admin/pedidos/abc'], ['GET', '/api/admin/pedidos/99999'], ['POST', '/api/admin/pedidos/abc/accion', { accion: 'cobrar' }], ['POST', '/api/admin/pedidos/1/accion', { accion: 'borrar' }], ['POST', '/api/admin/pedidos/1/accion', { accion: 'cobrar', recibido: 'mucho' }], ['POST', '/api/admin/pedidos/1/accion', { accion: 'cancelar', motivo: '' }], ['PUT', '/api/admin/packs/1', { pct: 500 }], ['PUT', '/api/admin/packs/abc', { pct: 10 }], ['PUT', '/api/admin/packs/1', { pct: 'x' }], ['GET', '/api/admin/movimientos/abc']]) {
    const r = await j(m, p, b, H); ok(`admin ${m} ${p} → no 500`, r.s < 500, 'estado ' + r.s);
  }
  { const peds = (await j('GET', '/api/admin/pedidos', undefined, H)).d.pedidos; const p = peds.find(o => !o.pagado && o.estado !== 'cancelado' && o.metodo_pago === 'fisico');
    const a1 = await j('POST', `/api/admin/pedidos/${p.id}/accion`, { accion: 'cancelar', motivo: 'Prueba de ataque' }, H); const a2 = await j('POST', `/api/admin/pedidos/${p.id}/accion`, { accion: 'cancelar', motivo: 'Otra vez' }, H);
    ok('cancelar un pedido dos veces: la segunda se rechaza (no devuelve el stock doble)', a1.s === 200 && a2.s === 409, `${a1.s}/${a2.s}`);
    const a3 = await j('POST', `/api/admin/pedidos/${p.id}/accion`, { accion: 'cobrar', recibido: 9999 }, H); ok('no se cobra un pedido cancelado', a3.s === 409, 'estado ' + a3.s); }

  // ---------- 10. Archivos estáticos y rutas ----------
  for (const p of ['/server/server.js', '/server/.env', '/server/tienda.db', '/package.json', '/.env', '/.git/config', '/node_modules/', '/js/../server/server.js', '/js/%2e%2e/server/server.js', '/img/../server/server.js', '/img/%2e%2e%2fserver%2fserver.js', '/css/../server/server.js', '/admin/../server/.env', '/img/a.svg', '/js/controller.js.map', '//server/server.js'])
  { const r = await fetch(BASE + p); const t = await r.text(); ok('no expone ' + p, r.status !== 200 || (!/require\(|ADMIN_CLAVE=|SQLite format/.test(t)), 'estado ' + r.status); }
  { const r = await fetch(BASE + '/api/health', { headers: { Origin: 'https://evil.com' } }); ok('cabeceras de seguridad', r.headers.get('x-content-type-options') === 'nosniff' && !!r.headers.get('x-frame-options'), [...r.headers.keys()].join(',')); }

  // ---------- 11. Límite de intentos (fuerza bruta) ----------
  { let bloq = 0; for (let i = 0; i < 14; i++) { const r = await j('POST', '/api/login', { email: 'ana.perez@correo.com', password: 'mala' + i }, XFF('9.9.9.9')); if (r.s === 429) bloq++; } ok('login con clave mala se bloquea (429)', bloq > 0, 'bloqueos ' + bloq); }
  { let bloq = 0; for (let i = 0; i < 12; i++) { const r = await j('POST', '/api/admin/login', { clave: 'mala' + i }, XFF('8.8.8.8')); if (r.s === 429) bloq++; } ok('login de administrador se bloquea (429)', bloq > 0, 'bloqueos ' + bloq); }
  { // ¿se puede saltar el límite cambiando la cabecera X-Forwarded-For?
    let pasa = 0; for (let i = 0; i < 25; i++) { const r = await j('POST', '/api/login', { email: 'luis.andrade@correo.com', password: 'mala' }, XFF('7.7.7.' + i)); if (r.s !== 429) pasa++; }
    ok('adivinar la clave de un correo cambiando de IP se bloquea', pasa <= 10, `intentos que pasaron: ${pasa}/25`);
    let admPasa = 0; for (let i = 0; i < 45; i++) { const r = await j('POST', '/api/admin/login', { clave: 'adivinar' + i }, XFF('5.5.5.' + i)); if (r.s !== 429) admPasa++; }
    ok('adivinar la clave de administrador cambiando de IP se bloquea', admPasa <= 30, `intentos que pasaron: ${admPasa}/45`); }
  { const r = await j('POST', '/api/login', { email: 'carlos.vega@correo.com', password: 'Demo1234' }); ok('un usuario legítimo (otro correo) sigue pudiendo entrar durante el ataque', r.s === 200, 'estado ' + r.s); }
  { const r = await j('POST', '/api/comentarios', { producto_id: P[0].id, texto: 'x'.repeat(200000), calificacion: 3 }, A); ok('cuerpo de 200 KB → responde 413 (no corta la conexión sin respuesta)', r.s === 413, 'estado ' + r.s); }

  // ---------- 12. Carga ----------
  { const t0 = Date.now(); const rr = await Promise.all(Array.from({ length: 150 }, (_, i) => fetch(BASE + '/api/bootstrap', { headers: XFF('6.6.' + (i % 250) + '.1') }).then(r => r.status).catch(() => 0)));
    const ms = Date.now() - t0; ok(`150 cargas simultáneas del catálogo (${ms} ms)`, rr.every(s => s === 200), 'estados: ' + [...new Set(rr)].join(',')); }
  ok('servidor sigue vivo al final', await vivo());

  console.log(res.map(r => r.join(' · ')).join('\n'));
  const f = res.filter(r => r[0] === 'FALLA'); console.log(`\nTotal ${res.length} pruebas · fallas ${f.length}`);
})();
