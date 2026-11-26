// Comentarios de ejemplo para que los productos en stock tengan opiniones de otros compradores.
// Se aplican una sola vez (clave 'comentarios_demo' en configuracion) desde actualizarCatalogo().
// Las preventas no llevan comentarios porque todavía nadie las ha recibido.

// Textos que no correspondían al producto (venían de la semilla antigua, antes de renombrar títulos)
const CORRECCIONES = [
  ['Oshi no Ko Vol. 9', 'La figura es preciosa, los detalles son increíbles.', 'El dibujo es precioso, los detalles de cada página son increíbles.'],
  ['Sakamoto Days Vol. 6', 'Muy buena calidad de pintura, llegó bien embalada.', 'Las escenas de acción son buenísimas y llegó bien embalado.'],
  ['Sword Art Online Vol. 3', 'Es una pieza de colección, vale cada dólar.', 'Un tomo de colección para los fans de SAO, vale cada dólar.'],
];

// Comentarios propios de los productos que se usan en las tareas de la prueba de usabilidad
const ESPECIFICOS = {
  'Frieren Vol. 6': [
    [5, 'Si viste el anime, este tomo te va a encantar: tiene partes que no salen en la serie.'],
    [4, 'Muy tranquilo y bonito de leer, ideal para las vacaciones.'],
  ],
  'KonoSuba Vol. 4': [
    [5, 'Me reí muchísimo, Megumin y Aqua son lo máximo.'],
    [4, 'Divertida como siempre, se lee rapidísimo.'],
  ],
  'Megumin KonoSuba': [
    [5, 'Perfecta para fans de KonoSuba, el sombrero tiene muchos detalles.'],
    [5, 'Linda figura y a buen precio, la regalé y le encantó.'],
  ],
};

// Comentarios generales por categoría (m = manga, n = novela ligera, f = figura)
const POR_CATEGORIA = {
  m: [
    [5, 'Muy buen tomo, las páginas vienen limpias y bien impresas.'],
    [4, 'Me gustó, aunque el final del tomo me dejó con ganas de más.'],
    [5, 'Llegó rápido y bien protegido. La historia se pone cada vez mejor.'],
    [3, 'Está bien, pero la portada vino con una pequeña marca.'],
    [4, 'Buena edición, el precio es justo para la calidad.'],
    [5, 'Lo compré para completar mi colección y quedé feliz.'],
    [4, 'Lectura entretenida, se lee en una tarde.'],
  ],
  n: [
    [5, 'Muy buena novela, la traducción se entiende sin problema.'],
    [4, 'Buena historia, aunque algunos capítulos se sienten lentos.'],
    [5, 'Las ilustraciones a color del inicio son lo mejor.'],
    [3, 'Me gustó, pero la letra es un poco pequeña.'],
    [4, 'Llegó en buen estado y bien empacada.'],
    [5, 'Excelente para seguir la historia después del anime.'],
  ],
  f: [
    [5, 'La figura es preciosa, la pintura está muy bien hecha.'],
    [4, 'Bonita, aunque la base es un poco liviana.'],
    [5, 'Llegó en su caja original y sin ningún golpe.'],
    [3, 'Buena figura, pero tardó un poco en llegar.'],
    [5, 'Se ve igual que en las fotos, muy buena calidad.'],
    [4, 'Vale lo que cuesta, se ve increíble en mi repisa.'],
  ],
};

const MINIMO = 2; // comentarios por producto en stock (los de las tareas quedan con 3)

async function aplicarComentariosDemo({ q, one, run, tx }) {
  // Comentario con lenguaje inapropiado escrito en la tienda en vivo: se elimina (pedido por el dueño de la tienda)
  await run("DELETE FROM comentarios WHERE lower(trim(texto))='es un webada' AND producto_id=(SELECT id FROM productos WHERE nombre='Misono Mika 1/7 Shizuku-tan')");
  if (await one("SELECT 1 AS x FROM configuracion WHERE clave='comentarios_demo'")) return;
  const usuarios = await q("SELECT id, nombre FROM usuarios WHERE id <= 15 AND email LIKE '%@correo.com' ORDER BY id");
  if (!usuarios.length) return;
  const prods = await q("SELECT p.id, p.nombre, c.codigo cat FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.preventa IS NULL ORDER BY p.id");
  const existentes = await q('SELECT producto_id pid, usuario_id uid, texto FROM comentarios');
  let k = 0, agregados = 0;
  await tx(async t => {
    for (const [nombre, viejo, nuevo] of CORRECCIONES)
      await t.run('UPDATE comentarios SET texto=? WHERE texto=? AND producto_id=(SELECT id FROM productos WHERE nombre=?)', nuevo, viejo, nombre);
    for (const p of prods) {
      const suyos = existentes.filter(c => c.pid === p.id);
      const pool = [...(ESPECIFICOS[p.nombre] || []), ...(POR_CATEGORIA[p.cat] || [])];
      const meta = ESPECIFICOS[p.nombre] ? suyos.length + ESPECIFICOS[p.nombre].length : MINIMO;
      let falta = meta - suyos.length, i = ESPECIFICOS[p.nombre] ? 0 : p.id % pool.length;
      const usados = new Set(suyos.map(c => c.uid)), textos = new Set(suyos.map(c => c.texto));
      for (let intentos = 0; falta > 0 && intentos < pool.length; intentos++, i = (i + 1) % pool.length) {
        const [r, texto] = pool[i];
        if (textos.has(texto)) continue;
        let u = usuarios[(p.id + k) % usuarios.length];
        for (let s = 0; usados.has(u.id) && s < usuarios.length; s++) u = usuarios[(p.id + k + s + 1) % usuarios.length];
        if (usados.has(u.id)) break;
        const fecha = new Date(Date.UTC(2026, 9, 1 + ((p.id * 3 + k) % 55), 14, (k * 7) % 60)).toISOString(); // entre octubre y noviembre de 2026
        await t.run('INSERT INTO comentarios(producto_id,usuario_id,autor,calificacion,texto,fecha) VALUES (?,?,?,?,?,?)', p.id, u.id, u.nombre, r, texto, fecha);
        usados.add(u.id); textos.add(texto); falta--; k++; agregados++;
      }
    }
    await t.run("INSERT OR REPLACE INTO configuracion(clave,valor,detalle) VALUES ('comentarios_demo',1,'Comentarios de ejemplo agregados (uso interno)')");
  });
  console.log(`Comentarios de ejemplo agregados: ${agregados}.`);
}

module.exports = { aplicarComentariosDemo };
