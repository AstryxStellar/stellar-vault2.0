// API de la aplicación de administración (carpeta admin/): CRUD de productos, movimientos de stock
// y gestión de pedidos (pago en tienda, entregas, cancelaciones y devoluciones).
// Se entra con la clave de la variable de entorno ADMIN_CLAVE (nunca se guarda en el código).
const crypto = require('crypto');

module.exports = function admin({ q, one, run, tx, HttpError, dbError, limitar, enviarComprobante }) {
  const sesiones = new Map(); // token -> vence (las sesiones de admin duran 8 horas)
  const exigir = req => {
    const t = String(req.headers['x-admin-token'] || ''), v = sesiones.get(t);
    if (!v || v < Date.now()) { sesiones.delete(t); throw new HttpError(401, { error: 'Tu sesión de administrador venció. Ingresa de nuevo.', requiereAdmin: true }); }
  };
  const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  // Columnas y tabla que necesita la administración (se crean solas en una base ya existente)
  async function preparar() {
    const cols = async t => (await q(`PRAGMA table_info(${t})`)).map(c => c.name);
    if (!(await cols('productos')).includes('activo')) await run('ALTER TABLE productos ADD COLUMN activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))');
    if (!(await cols('pedidos')).includes('entregado')) await run('ALTER TABLE pedidos ADD COLUMN entregado TEXT');
    await run(`CREATE TABLE IF NOT EXISTS movimientos_stock (
      id          INTEGER PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      tipo        TEXT NOT NULL CHECK (tipo IN ('alta','ingreso','devolucion','salida','ajuste','baja','reactivacion','edicion')),
      cantidad    INTEGER NOT NULL DEFAULT 0,
      stock_final INTEGER NOT NULL CHECK (stock_final >= 0),
      motivo      TEXT NOT NULL CHECK (length(trim(motivo)) >= 3),
      fecha       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  }
  const mov = (t, pid, tipo, cant, motivo) => t.run('INSERT INTO movimientos_stock(producto_id,tipo,cantidad,stock_final,motivo) VALUES (?,?,?,(SELECT stock FROM productos WHERE id=?),?)', pid, tipo, cant, pid, motivo);
  const texto = (v, min, max, campo) => { const s = String(v == null ? '' : v).trim(); if (s.length < min || s.length > max) throw new HttpError(422, { error: `${campo}: escribe entre ${min} y ${max} caracteres.` }); return s; };
  const producto = async id => { const p = await one('SELECT * FROM productos WHERE id=?', Number(id)); if (!p) throw new HttpError(404, { error: 'Producto no encontrado.' }); return p; };
  const datosProducto = async b => {
    const cat = await one('SELECT id FROM categorias WHERE codigo=?', String(b.cat || ''));
    if (!cat) throw new HttpError(422, { error: 'Elige una categoría.' });
    const precio = Number(b.precio), stock = Number(b.stock);
    if (!(precio > 0 && precio <= 10000)) throw new HttpError(422, { error: 'El precio debe estar entre 0.01 y 10000.' });
    if (!Number.isInteger(stock) || stock < 0 || stock > 9999) throw new HttpError(422, { error: 'El stock debe ser un número entero entre 0 y 9999.' });
    const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#be185d';
    return { cat: cat.id, nombre: texto(b.nombre, 2, 120, 'Nombre'), autor: texto(b.autor, 2, 120, 'Autor o fabricante'), editorial: texto(b.editorial, 2, 120, 'Editorial o licencia'),
      precio: Math.round(precio * 100) / 100, stock, preventa: String(b.preventa || '').trim() || null, promo: b.promo === '3x2' ? '3x2' : null,
      descripcion: texto(b.descripcion, 10, 2000, 'Descripción'), color };
  };
  const errorProducto = e => /UNIQUE constraint failed: productos\.nombre/.test(e.message) ? new HttpError(409, { error: 'Ya existe un producto con ese nombre.' }) : e instanceof HttpError ? e : dbError(e);

  async function pedidoCompleto(id) {
    const p = await one(`SELECT pe.*,pr.nombre prov,ci.nombre city,u.email cuenta,pg.estado pago_estado,pg.metodo pago_metodo,pg.motivo pago_motivo,pg.resuelto pago_fecha
      FROM pedidos pe JOIN usuarios u ON u.id=pe.usuario_id LEFT JOIN provincias pr ON pr.id=pe.provincia_id LEFT JOIN ciudades ci ON ci.id=pe.ciudad_id
      LEFT JOIN pagos pg ON pg.pedido_id=pe.id WHERE pe.id=?`, Number(id));
    if (!p) throw new HttpError(404, { error: 'Pedido no encontrado.' });
    p.items = await q('SELECT i.producto_id id,pr.nombre n,i.cantidad q,i.precio_unitario pu FROM pedido_items i JOIN productos pr ON pr.id=i.producto_id WHERE i.pedido_id=?', p.id);
    return p;
  }
  // Cancela un pedido: el trigger trg_pedido_cancelado devuelve el stock de los productos en stock.
  async function cancelar(p, motivo, devolucion) {
    await tx(async t => {
      await t.run("UPDATE pedidos SET estado='cancelado' WHERE id=?", p.id);
      if (devolucion) await t.run('UPDATE pagos SET motivo=? WHERE pedido_id=?', 'Devolución: ' + motivo, p.id);
      else await t.run("UPDATE pagos SET estado='cancelado',motivo=?,resuelto=? WHERE pedido_id=? AND estado='pendiente'", motivo, new Date().toISOString(), p.id);
      for (const i of p.items) await mov(t, i.id, 'devolucion', i.q, `${devolucion ? 'Devolución' : 'Cancelación'} del pedido ${p.numero}: ${motivo}`);
    });
  }

  const rutas = {
    'POST /api/admin/login': async ({ req, body }) => {
      limitar(req, 'adminlogin', 8, 600000);
      const clave = process.env.ADMIN_CLAVE;
      if (!clave) throw new HttpError(503, { error: 'Falta configurar la variable ADMIN_CLAVE en el servidor.' });
      if (!igual(body.clave || '', clave)) throw new HttpError(401, { error: 'Clave incorrecta.' });
      const token = crypto.randomBytes(32).toString('hex');
      sesiones.set(token, Date.now() + 8 * 3600e3);
      return { token };
    },
    'POST /api/admin/logout': async ({ req }) => { sesiones.delete(String(req.headers['x-admin-token'] || '')); return { ok: true }; },

    // ---------- Productos ----------
    'GET /api/admin/resumen': async ({ req }) => {
      exigir(req);
      const [prod, ped, mov] = await Promise.all([
        one('SELECT count(*) total,sum(activo=0) baja,sum(activo=1 AND preventa IS NULL AND stock<=3) bajo FROM productos'),
        one("SELECT count(*) total,sum(estado='cancelado') cancelados,sum(estado<>'cancelado' AND pagado=0) por_cobrar,sum(estado<>'cancelado' AND pagado=1 AND entregado IS NULL) por_entregar FROM pedidos"),
        q('SELECT m.*,p.nombre FROM movimientos_stock m JOIN productos p ON p.id=m.producto_id ORDER BY m.id DESC LIMIT 15')]);
      return { productos: prod, pedidos: ped, movimientos: mov };
    },
    'GET /api/admin/productos': async ({ req }) => {
      exigir(req);
      return { productos: await q(`SELECT p.id,c.codigo cat,c.nombre categoria,p.nombre,p.autor,p.editorial,p.precio,p.stock,p.preventa,p.promo,p.activo,p.color,p.descripcion,
        (SELECT coalesce(sum(i.cantidad),0) FROM pedido_items i JOIN pedidos pe ON pe.id=i.pedido_id WHERE i.producto_id=p.id AND pe.estado<>'cancelado') vendidos
        FROM productos p JOIN categorias c ON c.id=p.categoria_id ORDER BY c.orden,p.nombre`), categorias: await q('SELECT codigo,nombre FROM categorias ORDER BY orden') };
    },
    'POST /api/admin/productos': async ({ req, body }) => {
      exigir(req);
      try {
        const d = await datosProducto(body);
        const id = await tx(async t => {
          const r = await t.run(`INSERT INTO productos(categoria_id,nombre,autor,editorial,precio,stock,color,tinte,tinte_texto,preventa,promo,descripcion)
            VALUES (?,?,?,?,?,?,?,'#fdf2f8','#9d174d',?,?,?)`, d.cat, d.nombre, d.autor, d.editorial, d.precio, d.stock, d.color, d.preventa, d.promo, d.descripcion);
          const id = Number(r.lastInsertRowid);
          await mov(t, id, 'alta', d.stock, 'Producto nuevo');
          return id;
        });
        return { id };
      } catch (e) { throw errorProducto(e); }
    },
    'PUT /api/admin/productos/:id': async ({ req, body, params }) => {
      exigir(req);
      const p = await producto(params.id);
      try {
        const d = await datosProducto({ ...body, stock: p.stock }); // el stock solo cambia con un movimiento
        await tx(async t => {
          await t.run('UPDATE productos SET categoria_id=?,nombre=?,autor=?,editorial=?,precio=?,color=?,preventa=?,promo=?,descripcion=? WHERE id=?',
            d.cat, d.nombre, d.autor, d.editorial, d.precio, d.color, d.preventa, d.promo, d.descripcion, p.id);
          await mov(t, p.id, 'edicion', 0, 'Datos del producto editados');
        });
        return { ok: true };
      } catch (e) { throw errorProducto(e); }
    },
    // Movimiento de stock: ingreso (llega mercadería), devolución (vuelve un producto), salida o ajuste (conteo)
    'POST /api/admin/productos/:id/stock': async ({ req, body, params }) => {
      exigir(req);
      const p = await producto(params.id), tipo = String(body.tipo || ''), cant = Number(body.cantidad);
      if (!['ingreso', 'devolucion', 'salida', 'ajuste'].includes(tipo)) throw new HttpError(422, { error: 'Elige el tipo de movimiento.' });
      if (!Number.isInteger(cant) || cant === 0 || Math.abs(cant) > 9999) throw new HttpError(422, { error: 'La cantidad debe ser un número entero distinto de 0.' });
      const delta = tipo === 'salida' ? -Math.abs(cant) : tipo === 'ajuste' ? cant : Math.abs(cant);
      if (p.stock + delta < 0) throw new HttpError(409, { error: `No puedes dejar el stock en negativo (hay ${p.stock}).` });
      const motivo = texto(body.motivo, 3, 200, 'Motivo');
      await tx(async t => { await t.run('UPDATE productos SET stock=stock+? WHERE id=?', delta, p.id); await mov(t, p.id, tipo, delta, motivo); });
      return { stock: p.stock + delta };
    },
    // Dar de baja (deja de verse en la tienda, se conserva el historial) o volver a activar
    'POST /api/admin/productos/:id/estado': async ({ req, body, params }) => {
      exigir(req);
      const p = await producto(params.id), activo = body.activo ? 1 : 0, motivo = texto(body.motivo || (activo ? 'Producto reactivado' : ''), 3, 200, 'Motivo');
      await tx(async t => { await t.run('UPDATE productos SET activo=? WHERE id=?', activo, p.id); await mov(t, p.id, activo ? 'reactivacion' : 'baja', 0, motivo); });
      return { ok: true };
    },
    // Eliminar solo si nunca se vendió (si tiene pedidos, se da de baja)
    'DELETE /api/admin/productos/:id': async ({ req, params }) => {
      exigir(req);
      const p = await producto(params.id);
      if (await one('SELECT 1 x FROM pedido_items WHERE producto_id=?', p.id)) throw new HttpError(409, { error: 'Este producto ya tiene pedidos: dalo de baja en lugar de eliminarlo.' });
      await run('DELETE FROM productos WHERE id=?', p.id);
      return { ok: true };
    },
    'GET /api/admin/movimientos/:id': async ({ req, params }) => {
      exigir(req);
      return { movimientos: await q('SELECT * FROM movimientos_stock WHERE producto_id=? ORDER BY id DESC LIMIT 50', Number(params.id)) };
    },

    // ---------- Pedidos ----------
    'GET /api/admin/pedidos': async ({ req }) => {
      exigir(req);
      return { pedidos: await q(`SELECT pe.id,pe.numero,pe.fecha,pe.nombre,pe.telefono,pe.entrega,pe.metodo_pago,pe.total,pe.pagado,pe.estado,pe.entregado,pg.estado pago_estado,pg.motivo pago_motivo,
        (SELECT sum(cantidad) FROM pedido_items WHERE pedido_id=pe.id) unidades FROM pedidos pe LEFT JOIN pagos pg ON pg.pedido_id=pe.id ORDER BY pe.id DESC`) };
    },
    'GET /api/admin/pedidos/:id': async ({ req, params }) => { exigir(req); return { pedido: await pedidoCompleto(params.id) }; },
    // Acciones sobre un pedido. Pago en tienda con complicaciones: el cliente paga (cobrar), no completa el pago,
    // no se presenta o hay un problema con el producto (cancelar con motivo: se devuelve el stock), o devuelve lo comprado.
    'POST /api/admin/pedidos/:id/accion': async ({ req, body, params }) => {
      exigir(req);
      const p = await pedidoCompleto(params.id), a = String(body.accion || '');
      if (p.estado === 'cancelado') throw new HttpError(409, { error: 'Este pedido ya está cancelado.' });
      if (a === 'cobrar') {
        if (p.pagado) throw new HttpError(409, { error: 'Este pedido ya está pagado.' });
        if (p.metodo_pago !== 'fisico') throw new HttpError(409, { error: 'Los pagos con DeUna se confirman desde DeUna.' });
        const recibido = Number(body.recibido);
        if (!(recibido > 0)) throw new HttpError(422, { error: 'Escribe el monto recibido.' });
        if (recibido + 0.004 < p.total) throw new HttpError(422, { error: `Pago incompleto: faltan $${(p.total - recibido).toFixed(2)}. Cobra el total o cancela el pedido con el motivo "Pago incompleto".` });
        await tx(async t => {
          await t.run("UPDATE pagos SET estado='aprobado',resuelto=?,motivo=? WHERE pedido_id=?", new Date().toISOString(), recibido > p.total ? `Recibido $${recibido.toFixed(2)}, cambio $${(recibido - p.total).toFixed(2)}` : null, p.id);
          await t.run("UPDATE pedidos SET pagado=1,estado='confirmado' WHERE id=?", p.id);
        });
        enviarComprobante(p.id).catch(e => console.error('No se pudo enviar el comprobante:', e.message));
        return { ok: true, cambio: Math.max(0, Math.round((recibido - p.total) * 100) / 100) };
      }
      if (a === 'entregar') {
        if (!p.pagado) throw new HttpError(409, { error: 'Primero registra el pago del pedido.' });
        if (p.entregado) throw new HttpError(409, { error: 'Este pedido ya se entregó.' });
        await run('UPDATE pedidos SET entregado=? WHERE id=?', new Date().toISOString(), p.id);
        return { ok: true };
      }
      if (a === 'cancelar' || a === 'devolver') {
        const motivo = texto(body.motivo, 3, 200, 'Motivo');
        if (a === 'devolver' && !p.pagado) throw new HttpError(409, { error: 'Solo se puede devolver un pedido pagado. Si no pagó, cancélalo.' });
        if (a === 'cancelar' && p.pagado) throw new HttpError(409, { error: 'El pedido ya está pagado: registra una devolución.' });
        await cancelar(p, motivo, a === 'devolver');
        return { ok: true };
      }
      throw new HttpError(422, { error: 'Acción no válida.' });
    },
  };
  return { rutas, preparar };
};
