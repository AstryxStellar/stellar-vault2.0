/* Aplicación de administración de STELLAR VAULT: productos (CRUD), stock y pedidos. Usa la API /api/admin/. */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Number(n).toFixed(2);
const fecha = d => d ? new Date(d).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' }) : '—';
let TK = sessionStorage.getItem('sv_admin') || null, TAB = 'res', PRODS = [], CATS = [], PEDS = [], FP = { q: '', cat: '', est: '' }, FO = { q: '', est: '' };

async function api(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(TK ? { 'X-Admin-Token': TK } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('No pudimos conectar con el servidor. Intenta de nuevo en unos segundos.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && d.requiereAdmin) { TK = null; sessionStorage.removeItem('sv_admin'); login(d.error); throw new Error(d.error); }
  if (!r.ok) throw new Error(d.error || 'Error del servidor.');
  return d;
}
let tt; function toast(m, bad) { const t = $('#toast'); t.className = 'toast ' + (bad ? 'del' : 'ok'); t.innerHTML = `<span aria-hidden="true" class="ti">${bad ? '⚠' : '✓'}</span><span>${esc(m)}</span>`; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 5000); }
const pill = (t, k) => `<span class="pill ${k}">${esc(t)}</span>`;

/* ---------- Ingreso ---------- */
function login(err) {
  $('#tabs').hidden = true; $('#salir').hidden = true;
  $('#adm').innerHTML = `<div style="max-width:420px;margin:40px auto"><h2 class="h2" tabindex="-1">Ingreso de administrador</h2>
  <form class="panel" onsubmit="entrar(event)" novalidate><div class="err" id="lerr" role="alert" ${err ? '' : 'hidden'} style="margin-top:0">${err ? '⚠ ' + esc(err) : ''}</div>
  <div class="f" style="margin-top:0"><label for="clave">Clave de administrador</label><input id="clave" type="password" autocomplete="current-password" required aria-required="true"></div>
  <button class="btn" style="margin-top:18px">Ingresar</button></form></div>`;
  $('#clave').focus();
}
async function entrar(e) {
  e.preventDefault();
  try { TK = (await api('POST', '/api/admin/login', { clave: $('#clave').value })).token; sessionStorage.setItem('sv_admin', TK); $('#tabs').hidden = false; $('#salir').hidden = false; tab('res'); }
  catch (x) { const b = $('#lerr'); if (b) { b.textContent = '⚠ ' + x.message; b.hidden = false; b.focus(); } }
}
async function salir() { try { await api('POST', '/api/admin/logout'); } catch {} TK = null; sessionStorage.removeItem('sv_admin'); login(); }

function tab(t) {
  TAB = t; document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.id === 't-' + t));
  ({ res: resumen, prod: productos, ped: pedidos })[t]();
}

/* ---------- Resumen ---------- */
async function resumen() {
  const d = await api('GET', '/api/admin/resumen');
  const p = d.productos, o = d.pedidos;
  $('#adm').innerHTML = `<h2 class="h2" tabindex="-1">Resumen</h2>
  <div class="kpis"><div class="kpi"><b>${p.total}</b><span>productos (${p.baja || 0} dados de baja)</span></div><div class="kpi"><b>${p.bajo || 0}</b><span>con stock bajo (3 o menos)</span></div>
  <div class="kpi"><b>${o.total}</b><span>pedidos registrados</span></div><div class="kpi"><b>${o.por_cobrar || 0}</b><span>por cobrar</span></div><div class="kpi"><b>${o.por_entregar || 0}</b><span>pagados por entregar</span></div></div>
  <h3>Últimos movimientos de stock</h3>${tablaMov(d.movimientos, true)}`;
  $('#adm h2').focus();
}
const TIPOS = { alta: 'Alta', ingreso: 'Ingreso', devolucion: 'Devolución', salida: 'Salida', ajuste: 'Ajuste', baja: 'Baja', reactivacion: 'Reactivación', edicion: 'Edición' };
const tablaMov = (m, conProd) => m.length ? `<div class="twrap"><table class="at" style="min-width:600px"><thead><tr><th scope="col">Fecha</th>${conProd ? '<th scope="col">Producto</th>' : ''}<th scope="col">Tipo</th><th scope="col" class="n">Cantidad</th><th scope="col" class="n">Stock final</th><th scope="col">Motivo</th></tr></thead><tbody>
  ${m.map(x => `<tr><td>${fecha(x.fecha)}</td>${conProd ? `<td>${esc(x.nombre)}</td>` : ''}<td>${TIPOS[x.tipo] || x.tipo}</td><td class="n">${x.cantidad > 0 ? '+' : ''}${x.cantidad}</td><td class="n">${x.stock_final}</td><td>${esc(x.motivo)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="panel empty">Aún no hay movimientos.</div>';

/* ---------- Productos (CRUD) ---------- */
async function productos(recargar = true) {
  if (recargar) { const d = await api('GET', '/api/admin/productos'); PRODS = d.productos; CATS = d.categorias; }
  const q = FP.q.toLowerCase(), list = PRODS.filter(p => (!q || p.nombre.toLowerCase().includes(q)) && (!FP.cat || p.cat === FP.cat) && (!FP.est || (FP.est === 'baja' ? !p.activo : FP.est === 'bajo' ? p.activo && !p.preventa && p.stock <= 3 : p.activo)));
  const keep = document.activeElement && document.activeElement.id;
  $('#adm').innerHTML = `<h2 class="h2" tabindex="-1">Productos y stock</h2>
  <div class="tools"><input id="fq" type="search" placeholder="Buscar producto…" value="${esc(FP.q)}" oninput="FP.q=this.value;productos(false)" aria-label="Buscar producto">
  <select aria-label="Categoría" onchange="FP.cat=this.value;productos(false)"><option value="">Todas las categorías</option>${CATS.map(c => `<option value="${c.codigo}" ${FP.cat === c.codigo ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
  <select aria-label="Estado" onchange="FP.est=this.value;productos(false)">${[['', 'Todos'], ['activo', 'Activos'], ['bajo', 'Stock bajo'], ['baja', 'Dados de baja']].map(([v, t]) => `<option value="${v}" ${FP.est === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <span style="flex:1"></span><button class="btn" style="width:auto;padding:0 18px" onclick="formProducto()">+ Nuevo producto</button></div>
  <p class="sub" role="status">${list.length} de ${PRODS.length} productos</p>
  <div class="twrap"><table class="at"><thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col" class="n">Precio</th><th scope="col" class="n">Stock</th><th scope="col" class="n">Vendidos</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>
  ${list.map(p => `<tr class="${p.activo ? '' : 'off'}"><td><b>${esc(p.nombre)}</b><br><small>${esc(p.autor)}</small></td><td>${esc(p.categoria)}</td><td class="n">${money(p.precio)}${p.promo ? '<br>' + pill('3x2', 'wa') : ''}</td>
   <td class="n">${p.preventa ? pill('Preventa', 'mu') : p.stock <= 3 ? pill(p.stock, 'bad') : p.stock}</td><td class="n">${p.vendidos}</td><td>${p.activo ? pill('Activo', 'ok') : pill('De baja', 'bad')}</td>
   <td><button class="sb" onclick="formStock(${p.id})" aria-label="Mover stock de ${esc(p.nombre)}">Stock</button><button class="sb" onclick="formProducto(${p.id})" aria-label="Editar ${esc(p.nombre)}">Editar</button>${p.activo
     ? `<button class="sb r" onclick="formBaja(${p.id})" aria-label="Dar de baja ${esc(p.nombre)}">Dar de baja</button>` : `<button class="sb" onclick="reactivar(${p.id})" aria-label="Reactivar ${esc(p.nombre)}">Reactivar</button>`}${p.vendidos ? '' : `<button class="sb r" onclick="eliminar(${p.id})" aria-label="Eliminar ${esc(p.nombre)}">Eliminar</button>`}</td></tr>`).join('')}
  </tbody></table></div>`;
  if (keep === 'fq') { const i = $('#fq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } else if (recargar) $('#adm h2').focus();
}
const dlg = () => $('#dlg');
function abrir(titulo, cuerpo, pie) {
  dlg().innerHTML = `<div class="dh2"><h2 id="dlgT">${titulo}</h2><button class="x noprint" onclick="dlg().close()" aria-label="Cerrar">✕</button></div><div class="db">${cuerpo}<div class="msg" id="dmsg" role="alert"></div></div><div class="df">${pie}</div>`;
  if (!dlg().open) dlg().showModal(); const f = dlg().querySelector('input,select,textarea'); (f || dlg().querySelector('.x')).focus();
}
const fallo = m => { const b = $('#dmsg'); b.className = 'msg e'; b.textContent = '⚠ ' + m; };
const campo = (id, label, html) => `<div class="f"><label for="${id}">${label}</label>${html}</div>`;
const inp = (id, v, extra = '') => `<input id="${id}" value="${esc(v)}" ${extra}>`;
function formProducto(id) {
  const p = PRODS.find(x => x.id === id) || { cat: 'm', nombre: '', autor: '', editorial: '', precio: '', stock: 0, preventa: '', promo: null, descripcion: '', color: '#be185d' };
  abrir(id ? 'Editar producto' : 'Nuevo producto', `<form id="fp" onsubmit="guardarProducto(event,${id || 0})" novalidate><div class="g2">
   ${campo('p_cat', 'Categoría', `<select id="p_cat">${CATS.map(c => `<option value="${c.codigo}" ${p.cat === c.codigo ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`)}
   ${campo('p_nombre', 'Nombre', inp('p_nombre', p.nombre, 'required maxlength="120"'))}
   ${campo('p_autor', 'Autor o fabricante', inp('p_autor', p.autor, 'required'))}${campo('p_ed', 'Editorial o licencia', inp('p_ed', p.editorial, 'required'))}
   ${campo('p_precio', 'Precio (USD)', inp('p_precio', p.precio, 'type="number" min="0.01" step="0.01" required inputmode="decimal"'))}
   ${id ? campo('p_stock', 'Stock actual', inp('p_stock', p.stock, 'disabled aria-describedby="p_sh"') + '<small id="p_sh" style="display:block;color:var(--mute)">Cámbialo con el botón «Stock».</small>') : campo('p_stock', 'Stock inicial', inp('p_stock', p.stock, 'type="number" min="0" step="1" required inputmode="numeric"'))}
   ${campo('p_pre', 'Preventa (opcional)', inp('p_pre', p.preventa || '', 'placeholder="Ej.: Preventa oficial · mar. 2027"'))}
   ${campo('p_promo', 'Oferta', `<select id="p_promo"><option value="">Sin oferta</option><option value="3x2" ${p.promo === '3x2' ? 'selected' : ''}>3x2</option></select>`)}</div>
   ${campo('p_desc', 'Descripción', `<textarea id="p_desc" required>${esc(p.descripcion)}</textarea>`)}</form>`,
    `<button class="sb" onclick="dlg().close()">Cancelar</button><button class="btn" style="width:auto;padding:0 20px" type="submit" form="fp">${id ? 'Guardar cambios' : 'Crear producto'}</button>`);
}
async function guardarProducto(e, id) {
  e.preventDefault();
  const b = { cat: $('#p_cat').value, nombre: $('#p_nombre').value, autor: $('#p_autor').value, editorial: $('#p_ed').value, precio: $('#p_precio').value, stock: Number($('#p_stock').value), preventa: $('#p_pre').value, promo: $('#p_promo').value, descripcion: $('#p_desc').value };
  try { id ? await api('PUT', '/api/admin/productos/' + id, b) : await api('POST', '/api/admin/productos', b); dlg().close(); toast(id ? 'Producto actualizado.' : 'Producto creado.'); productos(); }
  catch (x) { fallo(x.message); }
}
async function formStock(id) {
  const p = PRODS.find(x => x.id === id), m = (await api('GET', '/api/admin/movimientos/' + id)).movimientos;
  abrir('Stock · ' + esc(p.nombre), `<p style="margin:0 0 8px">Stock actual: <b id="st_act">${p.stock}</b>${p.preventa ? ' (producto en preventa)' : ''}</p>
   <form id="fs" onsubmit="moverStock(event,${id})" novalidate><div class="g2">
   ${campo('s_tipo', 'Tipo de movimiento', `<select id="s_tipo"><option value="ingreso">Ingreso: llegó mercadería (+)</option><option value="devolucion">Devolución: el cliente devolvió (+)</option><option value="salida">Salida: dañado o perdido (−)</option><option value="ajuste">Ajuste por conteo (+ o −)</option></select>`)}
   ${campo('s_cant', 'Cantidad', inp('s_cant', '', 'type="number" step="1" required inputmode="numeric"'))}</div>
   ${campo('s_mot', 'Motivo', inp('s_mot', '', 'required placeholder="Ej.: Llegó pedido del proveedor"'))}</form>
   <h3 style="font-size:15px;margin:16px 0 8px">Historial</h3>${tablaMov(m, false)}`,
    `<button class="sb" onclick="dlg().close()">Cerrar</button><button class="btn" style="width:auto;padding:0 20px" type="submit" form="fs">Registrar movimiento</button>`);
}
async function moverStock(e, id) {
  e.preventDefault();
  try { const r = await api('POST', `/api/admin/productos/${id}/stock`, { tipo: $('#s_tipo').value, cantidad: Number($('#s_cant').value), motivo: $('#s_mot').value }); dlg().close(); toast('Stock actualizado: ahora hay ' + r.stock + '.'); productos(); }
  catch (x) { fallo(x.message); }
}
function formBaja(id) {
  const p = PRODS.find(x => x.id === id);
  abrir('Dar de baja', `<p style="margin:0">«${esc(p.nombre)}» dejará de mostrarse en la tienda. Sus pedidos e historial se conservan y puedes reactivarlo cuando quieras.</p>
   ${campo('b_mot', 'Motivo', `<select id="b_mot"><option>Producto descontinuado</option><option>Sin proveedor</option><option>Error en el registro</option><option>Temporada terminada</option></select>`)}`,
    `<button class="sb" onclick="dlg().close()">Cancelar</button><button class="btn" style="width:auto;padding:0 20px;background:#b91c1c;border-color:#b91c1c" onclick="cambiarEstado(${id},0)">Dar de baja</button>`);
}
async function cambiarEstado(id, activo) {
  try { await api('POST', `/api/admin/productos/${id}/estado`, { activo, motivo: activo ? 'Producto reactivado' : $('#b_mot').value }); if (dlg().open) dlg().close(); toast(activo ? 'Producto reactivado: ya se ve en la tienda.' : 'Producto dado de baja.'); productos(); }
  catch (x) { dlg().open ? fallo(x.message) : toast(x.message, true); }
}
const reactivar = id => cambiarEstado(id, 1);
function eliminar(id) {
  const p = PRODS.find(x => x.id === id);
  abrir('Eliminar producto', `<p style="margin:0">¿Eliminar «${esc(p.nombre)}» definitivamente? Solo se puede porque nunca se vendió. Esta acción no se puede deshacer.</p>`,
    `<button class="sb" onclick="dlg().close()">Cancelar</button><button class="btn" style="width:auto;padding:0 20px;background:#b91c1c;border-color:#b91c1c" onclick="borrar(${id})">Eliminar</button>`);
}
async function borrar(id) { try { await api('DELETE', '/api/admin/productos/' + id); dlg().close(); toast('Producto eliminado.'); productos(); } catch (x) { fallo(x.message); } }

/* ---------- Pedidos ---------- */
const estadoPedido = o => o.estado === 'cancelado' ? (o.pagado ? pill('Devuelto', 'bad') : pill('Cancelado', 'bad')) : !o.pagado ? pill(o.estado === 'pendiente_pago' ? 'Esperando DeUna' : 'Por cobrar', 'wa') : o.entregado ? pill('Entregado', 'ok') : pill('Pagado', 'ok');
async function pedidos(recargar = true) {
  if (recargar) PEDS = (await api('GET', '/api/admin/pedidos')).pedidos;
  const q = FO.q.toLowerCase(), list = PEDS.filter(o => (!q || (o.numero + ' ' + o.nombre).toLowerCase().includes(q)) && (!FO.est || (FO.est === 'cobrar' ? !o.pagado && o.estado !== 'cancelado' : FO.est === 'entregar' ? o.pagado && !o.entregado && o.estado !== 'cancelado' : o.estado === 'cancelado')));
  const keep = document.activeElement && document.activeElement.id;
  $('#adm').innerHTML = `<h2 class="h2" tabindex="-1">Pedidos</h2>
  <div class="tools"><input id="oq" type="search" placeholder="Buscar por N.º de pedido o cliente…" value="${esc(FO.q)}" oninput="FO.q=this.value;pedidos(false)" aria-label="Buscar pedido">
  <select aria-label="Estado" onchange="FO.est=this.value;pedidos(false)">${[['', 'Todos'], ['cobrar', 'Por cobrar'], ['entregar', 'Por entregar'], ['cancelado', 'Cancelados y devueltos']].map(([v, t]) => `<option value="${v}" ${FO.est === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <p class="sub" role="status">${list.length} de ${PEDS.length} pedidos</p>
  <div class="twrap"><table class="at"><thead><tr><th scope="col">N.º de pedido</th><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Entrega · Pago</th><th scope="col" class="n">Total</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>
  ${list.map(o => `<tr><td><b>${esc(o.numero)}</b></td><td>${fecha(o.fecha)}</td><td>${esc(o.nombre)}<br><small>${esc(o.telefono)}</small></td><td>${o.entrega === 'retiro' ? 'Retiro en tienda' : 'Servientrega'} · ${o.metodo_pago === 'deuna' ? 'DeUna' : 'Efectivo'}</td>
   <td class="n">${money(o.total)}</td><td>${estadoPedido(o)}${o.pago_motivo ? `<br><small>${esc(o.pago_motivo)}</small>` : ''}</td><td><button class="sb" onclick="verPedido(${o.id})" aria-label="Ver orden ${esc(o.numero)}">Ver orden</button></td></tr>`).join('')}
  </tbody></table></div>`;
  if (keep === 'oq') { const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } else if (recargar) $('#adm h2').focus();
}
const MOTIVOS = ['El cliente no se presentó a retirar', 'Pago incompleto', 'Producto dañado o faltante', 'El cliente se arrepintió', 'Dirección incorrecta / no se pudo entregar', 'Otro'];
async function verPedido(id) {
  const o = (await api('GET', '/api/admin/pedidos/' + id)).pedido, activo = o.estado !== 'cancelado';
  const bruto = o.items.reduce((a, i) => a + i.pu * i.q, 0);
  const acciones = !activo ? '' : !o.pagado ? (o.metodo_pago === 'fisico' ? `<h3 style="font-size:15px;margin:16px 0 6px">Cobrar en tienda</h3>
    <div class="g2">${campo('c_rec', 'Monto recibido (USD)', inp('c_rec', o.total.toFixed(2), 'type="number" min="0" step="0.01" inputmode="decimal"'))}<div class="f" style="align-self:end"><button class="btn" onclick="accion(${o.id},'cobrar')">Registrar pago</button></div></div>` : '<p class="info">El cliente está pagando con DeUna; el pago se confirma solo.</p>')
    + motivoHtml('Cancelar pedido', 'cancelar', o.id)
    : (o.entregado ? '' : `<button class="btn" style="margin-top:12px" onclick="accion(${o.id},'entregar')">Marcar como entregado</button>`) + motivoHtml('Registrar devolución', 'devolver', o.id);
  abrir('Orden de pedido ' + esc(o.numero), `<div class="orden">
   <p style="margin:0 0 10px">${estadoPedido(o)} ${o.pago_motivo ? '· ' + esc(o.pago_motivo) : ''}</p>
   <table><tbody><tr><th scope="row">Fecha</th><td>${fecha(o.fecha)}</td></tr><tr><th scope="row">Cliente</th><td>${esc(o.nombre)} · ${esc(o.telefono)} · ${esc(o.email)}</td></tr>
   <tr><th scope="row">Cuenta</th><td>${esc(o.cuenta)}</td></tr><tr><th scope="row">Entrega</th><td>${o.entrega === 'retiro' ? 'Retiro en tienda (Quito)' : 'Servientrega · ' + esc([o.direccion, o.city, o.prov].filter(Boolean).join(', '))}</td></tr>
   <tr><th scope="row">Pago</th><td>${o.metodo_pago === 'deuna' ? 'DeUna' : 'Efectivo'} · ${esc(o.pago_estado || '')}${o.pago_fecha ? ' · ' + fecha(o.pago_fecha) : ''}</td></tr>${o.entregado ? `<tr><th scope="row">Entregado</th><td>${fecha(o.entregado)}</td></tr>` : ''}</tbody></table>
   <table style="margin-top:12px"><thead><tr><th scope="col">Producto</th><th scope="col" class="n">Cant.</th><th scope="col" class="n">P. unit.</th><th scope="col" class="n">Importe</th></tr></thead><tbody>
   ${o.items.map(i => `<tr><td>${esc(i.n)}</td><td class="n">${i.q}</td><td class="n">${money(i.pu)}</td><td class="n">${money(i.pu * i.q)}</td></tr>`).join('')}</tbody></table>
   <table style="margin-top:8px;max-width:280px;margin-left:auto"><tbody>${o.descuento ? `<tr><td>Productos</td><td class="n">${money(bruto)}</td></tr><tr><td>Promo 3x2</td><td class="n">−${money(o.descuento)}</td></tr>` : ''}
   <tr><td>Subtotal</td><td class="n">${money(o.subtotal)}</td></tr><tr><td>Envío</td><td class="n">${money(o.envio)}</td></tr><tr><th scope="row">Total</th><td class="n"><b>${money(o.total)}</b></td></tr></tbody></table>
   <p style="font-size:12px;color:var(--mute);margin:10px 0 0">Guardado en la base de datos: tabla <code>pedidos</code> (id ${o.id}), sus productos en <code>pedido_items</code> y el cobro en <code>pagos</code>.</p></div>
   <div class="noprint">${acciones}</div>`,
    `<button class="sb" onclick="print()">Imprimir orden</button><button class="sb" onclick="dlg().close()">Cerrar</button>`);
}
const motivoHtml = (titulo, a, id) => `<details style="margin-top:14px"><summary style="font-weight:700;cursor:pointer">${titulo}</summary><div class="g2">
  ${campo('m_sel', 'Motivo', `<select id="m_sel">${MOTIVOS.map(m => `<option>${m}</option>`).join('')}</select>`)}${campo('m_det', 'Detalle (opcional)', inp('m_det', ''))}</div>
  <p style="font-size:12px;color:var(--mute);margin:6px 0">Los productos en stock vuelven al inventario automáticamente.</p><button class="sb r" onclick="accion(${id},'${a}')">${titulo}</button></div></details>`;
async function accion(id, a) {
  const body = { accion: a };
  if (a === 'cobrar') body.recibido = Number($('#c_rec').value);
  if (a === 'cancelar' || a === 'devolver') body.motivo = $('#m_sel').value + ($('#m_det').value.trim() ? ': ' + $('#m_det').value.trim() : '');
  try {
    const r = await api('POST', `/api/admin/pedidos/${id}/accion`, body);
    toast({ cobrar: 'Pago registrado' + (r.cambio ? `. Cambio a entregar: ${money(r.cambio)}` : '') + '. Se envió el comprobante.', entregar: 'Pedido marcado como entregado.', cancelar: 'Pedido cancelado y stock devuelto.', devolver: 'Devolución registrada y stock devuelto.' }[a]);
    PEDS = (await api('GET', '/api/admin/pedidos')).pedidos; pedidos(false); verPedido(id);
  } catch (x) { fallo(x.message); }
}

(async () => {
  if (!TK) return login();
  $('#tabs').hidden = false; $('#salir').hidden = false;
  try { await resumen(); } catch {}
})();
