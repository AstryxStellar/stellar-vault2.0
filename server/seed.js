// Datos iniciales: 15 productos por categoría y 15+ registros en cada tabla de datos.
const path = require('path');
const base = require('./seed-data.json'); // catálogo original (26 productos), imágenes, descripciones y ciudades

// [nombre, autor, editorial, categoría, precio, stock, color, tinte, texto, preventa, descripción]
const NUEVOS = [
  ['Jujutsu Kaisen Vol. 20', 'Gege Akutami', 'Edición en español', 'm', 12.5, 11, '#1e3a8a', '#eff6ff', '#1e3a8a', null, 'Jujutsu Kaisen, de Gege Akutami, sigue a Yuji Itadori, un estudiante que entra al mundo de los hechiceros tras tragarse un dedo maldito. Volumen 20 de la serie.'],
  ['Kaiju No. 8 Vol. 5', 'Naoya Matsumoto', 'Edición en español', 'm', 11.9, 8, '#0f766e', '#f0fdfa', '#115e59', null, 'Kaiju No. 8, de Naoya Matsumoto, cuenta la historia de Kafka Hibino, un hombre que obtiene el poder de transformarse en un kaiju. Volumen 5.'],
  ['Blue Lock Vol. 12', 'Muneyuki Kaneshiro · Yusuke Nomura', 'Edición en español', 'm', 12.9, 10, '#1d4ed8', '#eff6ff', '#1e40af', null, 'Blue Lock es un manga de fútbol en el que 300 delanteros compiten por convertirse en el mejor goleador de Japón. Volumen 12.'],
  ['Dandadan Vol. 7', 'Yukinobu Tatsu', 'Edición en español', 'm', 12.5, 9, '#c026d3', '#fdf4ff', '#86198f', null, 'Dandadan, de Yukinobu Tatsu, mezcla fantasmas, extraterrestres y comedia en la historia de Momo y Okarun. Volumen 7 de la serie.'],
  ['Oshi no Ko Vol. 9', 'Aka Akasaka · Mengo Yokoyari', 'Edición en español', 'm', 13.5, 6, '#db2777', '#fdf2f8', '#9d174d', null, 'Oshi no Ko explora el lado oscuro de la industria del entretenimiento japonés desde la mirada de un fan reencarnado. Volumen 9.'],
  ['Sakamoto Days Vol. 6', 'Yuto Suzuki', 'Edición en español', 'm', 11.9, 12, '#ca8a04', '#fefce8', '#854d0e', null, 'Sakamoto Days sigue a un legendario asesino retirado que lleva una vida tranquila como tendero y debe volver a la acción para proteger a su familia. Volumen 6.'],

  ['Sword Art Online Vol. 3', 'Reki Kawahara', 'Yen Press', 'n', 16.5, 7, '#0369a1', '#f0f9ff', '#075985', null, 'Sword Art Online, de Reki Kawahara, es una serie de novelas ligeras sobre jugadores atrapados en un videojuego de realidad virtual. Volumen 3, edición en inglés.'],
  ['Re:Zero Vol. 10', 'Tappei Nagatsuki', 'Yen Press', 'n', 16.9, 5, '#7c3aed', '#f5f3ff', '#5b21b6', null, 'Re:Zero, de Tappei Nagatsuki, sigue a Subaru, un joven transportado a otro mundo que revive una y otra vez el mismo día. Volumen 10, edición en inglés.'],
  ['Overlord Vol. 12', 'Kugane Maruyama', 'Yen Press', 'n', 18.5, 6, '#334155', '#f1f5f9', '#1e293b', null, 'Overlord, de Kugane Maruyama, narra la historia de un jugador que queda atrapado en su videojuego convertido en un poderoso hechicero. Volumen 12, edición en inglés.'],
  ['No Game No Life Vol. 6', 'Yuu Kamiya', 'Yen Press', 'n', 15.9, 9, '#e11d48', '#fff1f2', '#9f1239', null, 'No Game No Life, de Yuu Kamiya, trata de dos hermanos genios de los videojuegos llevados a un mundo donde todo se decide con juegos. Volumen 6, edición en inglés.'],
  ['Spice and Wolf Vol. 8', 'Isuna Hasekura', 'Yen Press', 'n', 16, 4, '#b45309', '#fffbeb', '#92400e', null, 'Spice and Wolf, de Isuna Hasekura, sigue a un mercader viajero y a Holo, una loba sabia, en sus aventuras comerciales. Volumen 8, edición en inglés.'],
  ['KonoSuba Vol. 4', 'Natsume Akatsuki', 'Yen Press', 'n', 15.5, 10, '#15803d', '#f0fdf4', '#166534', null, 'KonoSuba, de Natsume Akatsuki, es una comedia isekai sobre un grupo de aventureros poco convencionales. Volumen 4, edición en inglés.'],

  ['Rem 1/7 Re:Zero', 'Good Smile Company', 'Re:Zero Licensed', 'f', 168, 99, '#2563eb', '#eff6ff', '#1e40af', 'Preventa oficial · mar. 2027', 'Figura a escala 1/7 de Rem, personaje de Re:Zero, fabricada por Good Smile Company con licencia oficial. Disponible en preventa.'],
  ['Asuna 1/7 Sword Art Online', 'Aniplex+', 'Sword Art Online Licensed', 'f', 159, 6, '#dc2626', '#fef2f2', '#991b1b', null, 'Figura a escala 1/7 de Asuna, de Sword Art Online, distribuida por Aniplex+ con licencia oficial.'],
  ['Zero Two 1/7 Darling in the Franxx', 'Alter', 'Trigger Licensed', 'f', 185, 99, '#be185d', '#fdf2f8', '#9d174d', 'Preventa oficial · feb. 2027', 'Figura a escala 1/7 de Zero Two, de Darling in the Franxx, fabricada por Alter con licencia oficial. Disponible en preventa.'],
  ['Nezuko Kamado 1/8 Demon Slayer', 'Aniplex+', 'Demon Slayer Licensed', 'f', 139, 5, '#e11d48', '#fff1f2', '#9f1239', null, 'Figura a escala 1/8 de Nezuko Kamado, de Demon Slayer, distribuida por Aniplex+ con licencia oficial.'],
  ['Anya Forger 1/7 Spy × Family', 'Kotobukiya', 'Spy × Family Licensed', 'f', 129, 7, '#15803d', '#f0fdf4', '#166534', null, 'Figura a escala 1/7 de Anya Forger, de Spy × Family, fabricada por Kotobukiya con licencia oficial.'],
  ['Rei Ayanami 1/7 Evangelion', 'Bandai Spirits', 'Studio Khara Licensed', 'f', 172, 99, '#0369a1', '#f0f9ff', '#075985', 'Preventa oficial · abr. 2027', 'Figura a escala 1/7 de Rei Ayanami, de Evangelion, fabricada por Bandai Spirits con licencia oficial. Disponible en preventa.'],
  ['Hatsune Miku 1/7', 'Good Smile Company', 'Crypton Future Media Licensed', 'f', 155, 4, '#0d9488', '#f0fdfa', '#115e59', null, 'Figura a escala 1/7 de Hatsune Miku, la cantante virtual de Crypton Future Media, fabricada por Good Smile Company.'],
];

// ---- Completa 15 productos EN STOCK y 15 en PREVENTA por categoría ----
const PAL = [['#1e3a8a', '#eff6ff', '#1e3a8a'], ['#0f766e', '#f0fdfa', '#115e59'], ['#be185d', '#fdf2f8', '#9d174d'], ['#b45309', '#fffbeb', '#92400e'],
  ['#7c3aed', '#f5f3ff', '#5b21b6'], ['#15803d', '#f0fdf4', '#166534'], ['#dc2626', '#fef2f2', '#991b1b'], ['#0369a1', '#f0f9ff', '#075985'], ['#334155', '#f1f5f9', '#1e293b']];
const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
const preventa = i => `Preventa oficial · ${MESES[i % 12]} 2027`;
const pal = i => PAL[i % PAL.length];
const EXTRA = [];
// Mangas en preventa: [nombre, autor, precio]
[['One Piece Vol. 108', 'Eiichiro Oda', 12.9], ['Chainsaw Man Vol. 16', 'Tatsuki Fujimoto', 11.9], ['Jujutsu Kaisen Vol. 21', 'Gege Akutami', 12.5], ['Spy × Family Vol. 9', 'Tatsuya Endo', 12.5],
 ['Frieren Vol. 7', 'Kanehito Yamada', 13.2], ['Blue Lock Vol. 13', 'Muneyuki Kaneshiro', 12.9], ['Kaiju No. 8 Vol. 6', 'Naoya Matsumoto', 11.9], ['Dandadan Vol. 8', 'Yukinobu Tatsu', 12.5],
 ['Oshi no Ko Vol. 10', 'Aka Akasaka', 13.5], ['Sakamoto Days Vol. 7', 'Yuto Suzuki', 11.9], ['Vinland Saga Vol. 27', 'Makoto Yukimura', 14.5], ['Berserk Vol. 42', 'Kentaro Miura', 15.9],
 ['Haikyu!! Vol. 45', 'Haruichi Furudate', 10.9], ['My Hero Academia Vol. 40', 'Kohei Horikoshi', 11.5], ['Witch Hat Atelier Vol. 12', 'Kamome Shirahama', 13.9]]
  .forEach(([n, a, p], i) => EXTRA.push([n, a, 'Edición en español', 'm', p, 99, ...pal(i), preventa(i), `${n}, de ${a}. Edición en español, disponible en preventa oficial.`]));
// Novelas ligeras en preventa
[['Sword Art Online Vol. 4', 'Reki Kawahara', 16.5], ['Re:Zero Vol. 11', 'Tappei Nagatsuki', 16.9], ['Overlord Vol. 13', 'Kugane Maruyama', 18.5], ['No Game No Life Vol. 7', 'Yuu Kamiya', 15.9],
 ['Spice and Wolf Vol. 9', 'Isuna Hasekura', 16], ['KonoSuba Vol. 5', 'Natsume Akatsuki', 15.5], ['Youkoso Jitsuryoku Vol. 26', 'Shōgo Kinugasa', 16], ['Date a Live Vol. 17', 'Koushi Tachibana', 17.5],
 ['Mushoku Tensei Vol. 8', 'Rifujin na Magonote', 15.5], ['Tensei shitara Slime Datta Ken Vol. 19', 'Fuse', 18], ['Make Heroine ga Oosugiru! Vol. 9', 'Takibi Amamori', 15.5], ['Otonari no Tenshi-sama Vol. 6', 'Saekisan', 16],
 ['Toradora! Vol. 2', 'Yuyuko Takemiya', 15.9], ['The Apothecary Diaries Vol. 4', 'Natsu Hyuuga', 16.5], ['Is It Wrong to Try to Pick Up Girls in a Dungeon? Vol. 17', 'Fujino Omori', 16.9]]
  .forEach(([n, a, p], i) => EXTRA.push([n, a, 'Yen Press', 'n', p, 99, ...pal(i + 3), preventa(i + 2), `${n}, de ${a}. Novela ligera en edición en inglés de Yen Press, disponible en preventa oficial.`]));
// Figuras en stock: [nombre, fabricante, licencia, precio, stock]
[['Kurumi Tokisaki 1/7 Date A Live', 'Alter', 'Date A Live Licensed', 149, 5], ['Marin Kitagawa 1/7 My Dress-Up Darling', 'Kotobukiya', 'Aniplex Licensed', 135, 8],
 ['Power 1/7 Chainsaw Man', 'Good Smile Company', 'MAPPA Licensed', 142, 6], ['Yor Forger 1/7 Spy × Family', 'Bandai Spirits', 'Spy × Family Licensed', 128, 9], ['Frieren 1/7 Sousou no Frieren', 'Good Smile Company', 'Madhouse Licensed', 156, 4]]
  .forEach(([n, f, l, p, s], i) => EXTRA.push([n, f, l, 'f', p, s, ...pal(i + 1), null, `Figura a escala de ${n.replace(/ 1\/\d.*/, '')}, fabricada por ${f} con licencia oficial.`]));
// Figuras en preventa
[['Makima 1/7 Chainsaw Man', 'Good Smile Company', 'MAPPA Licensed', 178], ['Nakano Miku 1/7 The Quintessential Quintuplets', 'Kotobukiya', 'Bibury Animation Licensed', 149], ['Violet Evergarden 1/7', 'Alter', 'Kyoto Animation Licensed', 189],
 ['Mai Sakurajima 1/7 Rascal Does Not Dream', 'Aniplex+', 'CloverWorks Licensed', 165], ['Emilia 1/7 Re:Zero', 'Good Smile Company', 'White Fox Licensed', 162], ['Aqua 1/7 KonoSuba', 'Alter', 'Studio Deen Licensed', 154],
 ['Hoshino Ai 1/7 Oshi no Ko', 'Kadokawa', 'Doga Kobo Licensed', 170], ['Kaguya Shinomiya 1/7 Love Is War', 'Aniplex+', 'A-1 Pictures Licensed', 158], ['Yor Forger Thorn Princess 1/7', 'Good Smile Company', 'Wit Studio Licensed', 181],
 ['Hatsune Miku Symphony 1/7', 'Good Smile Company', 'Crypton Future Media Licensed', 175]]
  .forEach(([n, f, l, p], i) => EXTRA.push([n, f, l, 'f', p, 99, ...pal(i + 5), preventa(i + 4), `Figura a escala de ${n.replace(/ 1\/\d.*/, '')}, fabricada por ${f} con licencia oficial. Disponible en preventa.`]));

const DESTACADOS =new Set(['Chainsaw Man Vol. 15', 'Frieren Vol. 6', 'Furina 1/7 Genshin Impact', 'Mushoku Tensei Vol. 7']);

const REGLAS = [
  // [ámbito, campo, tipo, valor, condición, mensaje]
  ['checkout', 'name', 'regex', '^\\s*\\S{2,}(\\s+\\S{2,})+\\s*$', null, 'Escribe tu nombre y apellido.'],
  ['checkout', 'tel', 'regex', '^\\D*(\\d\\D*){7,10}$', null, 'Ingresa un teléfono de 7 a 10 dígitos.'],
  ['checkout', 'email', 'regex', '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$', null, 'Ingresa un correo válido, por ejemplo nombre@correo.com.'],
  ['checkout', 'prov', 'requerido', null, 'dm=ship', 'Selecciona tu provincia.'],
  ['checkout', 'city', 'requerido', null, 'dm=ship', 'Selecciona tu ciudad.'],
  ['checkout', 'addr', 'minlen', '5', 'dm=ship', 'Ingresa la dirección de entrega completa.'],
  ['checkout', 'piso', 'requerido', null, 'dm=ship&type<>Casa', 'Indica el piso.'],
  ['checkout', 'unit', 'requerido', null, 'dm=ship&type<>Casa', 'Indica el número de departamento u oficina.'],
  ['registro', 'nombre', 'minlen', '2', null, 'Escribe tu nombre.'],
  ['registro', 'email', 'regex', '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$', null, 'Ingresa un correo válido, por ejemplo nombre@correo.com.'],
  ['registro', 'password', 'minlen', '6', null, 'La contraseña debe tener al menos 6 caracteres.'],
  ['login', 'email', 'regex', '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$', null, 'Ingresa un correo válido, por ejemplo nombre@correo.com.'],
  ['comentario', 'texto', 'minlen', '3', null, 'Escribe tu comentario.'],
  ['comentario', 'texto', 'maxlen', '500', null, 'El comentario no puede pasar de 500 caracteres.'],
  ['comentario', 'calificacion', 'rango', '1-5', null, 'La calificación debe estar entre 1 y 5.'],
];

const USUARIOS = [
  'Ana Pérez', 'Luis Andrade', 'María Torres', 'Carlos Vega', 'Sofía Ramírez', 'Diego Cevallos', 'Valeria Moreno',
  'Andrés Salazar', 'Camila Ortiz', 'Jorge Paredes', 'Daniela Játiva', 'Mateo Villacís', 'Paola Guerrero', 'Sebastián Naranjo', 'Gabriela Mena',
];
const COMENTARIOS = [
  [1, 'Luis', 5, 'Excelente tomo, llegó en perfecto estado.'], [2, 'María', 4, 'Muy buena historia, la impresión es nítida.'],
  [3, 'Carlos', 5, 'Uno de mis mangas favoritos, lo recomiendo.'], [5, 'Sofía', 4, 'Buen volumen, el papel es de calidad.'],
  [6, 'Diego', 5, 'Frieren nunca decepciona, muy bonito el arte.'], [7, 'Valeria', 3, 'Está bien, aunque esperaba más extras.'],
  [16, 'Andrés', 5, 'La novela está genial, la traducción es muy buena.'], [17, 'Camila', 4, 'Buen libro, el envío fue rápido.'],
  [18, 'Jorge', 5, 'Me encantó este volumen, la trama avanza mucho.'], [31, 'Daniela', 5, 'La figura es preciosa, los detalles son increíbles.'],
  [32, 'Mateo', 4, 'Muy buena calidad de pintura, llegó bien embalada.'], [33, 'Paola', 5, 'Es una pieza de colección, vale cada dólar.'],
  [4, 'Sebastián', 4, 'Divertido de principio a fin.'], [19, 'Gabriela', 4, 'Muy entretenida, ya quiero el siguiente tomo.'],
  [8, 'Ana', 5, 'Impresión perfecta y llegó antes de lo esperado.'],
];

function seed(db, hashPassword) {
  const ins = (sql, ...a) => db.prepare(sql).run(...a);
  db.exec('BEGIN');
  try {
    // Configuración
    for (const [k, v, d] of [
      ['envio_costo', 3.5, 'Costo de envío por Servientrega (USD)'],
      ['envio_gratis_desde', 60, 'Compra mínima para envío gratis (USD)'],
      ['max_cantidad_stock', 10, 'Máximo de unidades por compra en productos en stock'],
      ['max_cantidad_preventa', 5, 'Máximo de unidades por compra en preventas'],
    ]) ins('INSERT INTO configuracion(clave,valor,detalle) VALUES (?,?,?)', k, v, d);

    // Categorías
    [['m', 'Manga', 'Mangas'], ['n', 'Novela ligera', 'Novelas ligeras'], ['f', 'Figura', 'Figuras coleccionables']]
      .forEach(([c, n, p], i) => ins('INSERT INTO categorias(codigo,nombre,plural,orden) VALUES (?,?,?,?)', c, n, p, i + 1));
    const catId = Object.fromEntries(db.prepare('SELECT codigo,id FROM categorias').all().map(r => [r.codigo, r.id]));

    // Provincias y ciudades
    for (const [prov, ciudades] of Object.entries(base.CITY)) {
      const pid = Number(ins('INSERT INTO provincias(nombre) VALUES (?)', prov).lastInsertRowid);
      ciudades.forEach(c => ins('INSERT INTO ciudades(provincia_id,nombre) VALUES (?,?)', pid, c));
    }

    // Productos: los 26 originales + nuevos hasta completar 15 por categoría
    const addProd = (nombre, autor, ed, cat, precio, stock, c, t, tc, pre, desc) =>
      Number(ins(`INSERT INTO productos(categoria_id,nombre,autor,editorial,precio,stock,color,tinte,tinte_texto,preventa,destacado,descripcion)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, catId[cat], nombre, autor, ed, precio, stock, c, t, tc, pre, DESTACADOS.has(nombre) ? 1 : 0, desc).lastInsertRowid);
    base.P.forEach((p, i) => {
      const id = addProd(p.name, p.by, p.pub, p.cat, p.price, p.stock, p.c, p.tint, p.tc, p.pre || null, base.D[i]);
      if (base.IMG[i]) ins('INSERT INTO imagenes_producto(producto_id,url,orden) VALUES (?,?,1)', id, base.IMG[i]);
    });
    [...NUEVOS, ...EXTRA].forEach(n => addProd(...n));

    // Usuarios (contraseña de prueba: Demo1234)
    const pass = hashPassword('Demo1234');
    USUARIOS.forEach((n, i) => ins('INSERT INTO usuarios(nombre,email,password_hash,verificado) VALUES (?,?,?,1)',
      n, n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.') + '@correo.com', pass));

    // Reglas de validación
    REGLAS.forEach(r => ins('INSERT INTO reglas_validacion(ambito,campo,tipo,valor,condicion,mensaje) VALUES (?,?,?,?,?,?)', ...r));

    // Pedidos de ejemplo (se descuenta stock con los triggers)
    const stockProds = db.prepare('SELECT id,precio FROM productos WHERE preventa IS NULL AND stock >= 8 ORDER BY id').all();
    const lugares = [['Pichincha', 'Quito'], ['Guayas', 'Guayaquil'], ['Azuay', 'Cuenca']];
    const envioCosto = 3.5, gratis = 60;
    for (let i = 0; i < 15; i++) {
      const items = [0, 1, 2].slice(0, 1 + (i % 3)).map(k => ({ ...stockProds[(i * 3 + k) % stockProds.length], q: 1 + ((i + k) % 2) }));
      const subtotal = Math.round(items.reduce((a, it) => a + it.precio * it.q, 0) * 100) / 100;
      const retiro = i % 3 === 0, deuna = i % 2 === 0;
      const envio = retiro ? 0 : subtotal >= gratis ? 0 : envioCosto;
      const [prov, ciudad] = lugares[i % 3];
      const pid = retiro ? null : db.prepare('SELECT id FROM provincias WHERE nombre=?').get(prov).id;
      const cid = retiro ? null : db.prepare('SELECT c.id FROM ciudades c WHERE c.provincia_id=? AND c.nombre=?').get(pid, ciudad).id;
      const depto = i % 4 === 1 && !retiro;
      const ped = Number(ins(`INSERT INTO pedidos(numero,usuario_id,nombre,telefono,email,entrega,metodo_pago,provincia_id,ciudad_id,direccion,tipo_vivienda,piso,unidad,subtotal,envio,total,pagado,fecha)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        '#SV-2026-' + (1001 + i * 37), i + 1, USUARIOS[i], '09' + String(80000000 + i * 1234567).slice(0, 8),
        USUARIOS[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.') + '@correo.com',
        retiro ? 'retiro' : 'envio', deuna ? 'deuna' : 'fisico', pid, cid, retiro ? null : `Av. Principal N${10 + i}-${20 + i} y Calle ${i + 1}`,
        depto ? 'Departamento' : 'Casa', depto ? '3' : null, depto ? '3B' : null,
        subtotal, envio, Math.round((subtotal + envio) * 100) / 100, deuna ? 1 : 0,
        new Date(Date.UTC(2026, 8, 1 + i * 2, 15, 30)).toISOString()).lastInsertRowid);
      items.forEach(it => ins('INSERT INTO pedido_items(pedido_id,producto_id,cantidad,precio_unitario) VALUES (?,?,?,?)', ped, it.id, it.q, it.precio));
    }

    // Comentarios
    COMENTARIOS.forEach(([pid, , r, t], i) => ins('INSERT INTO comentarios(producto_id,usuario_id,autor,calificacion,texto,fecha) VALUES (?,?,?,?,?,?)',
      pid, i + 1, USUARIOS[i], r, t, new Date(Date.UTC(2026, 8, 5 + i, 12, 0)).toISOString()));

    // Favoritos de ejemplo (usuario, producto)
    for (let i = 0; i < 15; i++) ins('INSERT INTO favoritos(usuario_id,producto_id) VALUES (?,?)', i + 1, 1 + ((i * 7) % 90));

    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { seed };
