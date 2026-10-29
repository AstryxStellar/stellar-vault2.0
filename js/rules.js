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
  const api = { validar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Reglas = api;
})(typeof window !== 'undefined' ? window : this);
