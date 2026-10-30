/* Motor de reglas de validación. Las reglas NO están aquí: vienen de la tabla reglas_validacion de la base de datos.
   Lo usan el navegador (para avisar al instante) y el servidor (que es quien decide). */
(function (root) {
  // condicion: uno o varios 'campo=valor' / 'campo<>valor' unidos con '&'
  function cumple(cond, d) {
    if (!cond) return true;
    return cond.split('&').every(c => {
      const m = c.match(/^(\w+)(<>|=)(.*)$/);
      if (!m) return true;
      const v = String(d[m[1]] == null ? '' : d[m[1]]);
      return m[2] === '=' ? v === m[3] : v !== m[3];
    });
  }
  function falla(r, v) {
    const s = String(v == null ? '' : v);
    switch (r.tipo) {
      case 'regex': return !new RegExp(r.valor).test(s);
      case 'minlen': return s.trim().length < Number(r.valor);
      case 'maxlen': return s.trim().length > Number(r.valor);
      case 'requerido': return s.trim() === '';
      case 'rango': { const [a, b] = r.valor.split('-').map(Number), n = Number(s); return !(Number.isFinite(n) && n >= a && n <= b); }
      default: return false;
    }
  }
  // reglas: filas de reglas_validacion; devuelve { campo: mensaje } solo con los campos que fallan
  function validar(reglas, ambito, datos) {
    const err = {};
    for (const r of reglas) {
      if (r.ambito !== ambito || err[r.campo] || !cumple(r.condicion, datos)) continue;
      if (falla(r, datos[r.campo])) err[r.campo] = r.mensaje;
    }
    return err;
  }
  // Packs: si el carrito tiene todos los productos de un pack, esas unidades llevan el descuento del pack.
  // items: [{ id, precio, q }]   packs: [{ id, nombre, pct, ids: [id de producto] }]   -> { total, lineas: [{ id, nombre, sets, monto }] }
  // Un producto solo cuenta para un pack a la vez (se aplican primero los de mayor descuento).
  function descuentoPacks(items, packs) {
    const resto = {}, precio = {};
    for (const i of items) { resto[i.id] = (resto[i.id] || 0) + i.q; precio[i.id] = i.precio; }
    const lineas = [];
    for (const p of [...packs].sort((a, b) => b.pct - a.pct || a.id - b.id)) {
      if (!p.ids.length) continue;
      const sets = Math.min(...p.ids.map(id => resto[id] || 0));
      if (sets <= 0) continue;
      p.ids.forEach(id => { resto[id] -= sets; });
      lineas.push({ id: p.id, nombre: p.nombre, sets, monto: Math.round(sets * p.ids.reduce((a, id) => a + precio[id], 0) * p.pct) / 100 });
    }
    return { total: Math.round(lineas.reduce((a, l) => a + l.monto, 0) * 100) / 100, lineas };
  }
  const api = { validar, descuentoPacks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Reglas = api;
})(typeof window !== 'undefined' ? window : this);
