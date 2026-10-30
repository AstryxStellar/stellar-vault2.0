// Genera las páginas HTML independientes de la tienda (todas comparten encabezado, pie, estilos y scripts).
// Uso: node tools/paginas.js   (vuelve a ejecutarlo si cambias el encabezado o el pie)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// [archivo, vista, título, descripción]
const PAGINAS = [
  ['index.html', 'home', 'Inicio', 'Tienda de mangas, novelas ligeras y figuras coleccionables en Ecuador.'],
  ['ofertas.html', 'ofer', 'Ofertas', 'Packs de una misma serie y rebajas en productos elegidos.'],
  ['catalogo.html', 'cat', 'Catálogo', 'Catálogo de mangas, novelas ligeras y figuras con filtros por categoría y disponibilidad.'],
  ['producto.html', 'prod', 'Producto', 'Detalle del producto: fotos, precio, disponibilidad y comentarios.'],
  ['favoritos.html', 'fav', 'Favoritos', 'Tus productos guardados como favoritos.'],
  ['pedidos.html', 'acct', 'Mis pedidos', 'Historial de tus pedidos y su estado de pago.'],
  ['pagar.html', 'co', 'Finalizar pedido', 'Datos de entrega y pago de tu pedido.'],
  ['ingresar.html', 'login', 'Iniciar sesión', 'Inicia sesión o crea tu cuenta en STELLAR VAULT.'],
  ['perfil.html', 'perfil', 'Mi perfil', 'Edita tus datos, tu foto, tu contraseña y la apariencia de la tienda.'],
  ['ayuda.html', 'help', 'Ayuda', 'Preguntas frecuentes sobre compras, envíos, pagos y preventas.'],
];

const NAV = [['index.html', 'home', 'Inicio'], ['catalogo.html', 'cat', 'Catálogo'], ['ofertas.html', 'ofer', 'Ofertas'], ['favoritos.html', 'fav', 'Favoritos'], ['pedidos.html', 'acct', 'Mis pedidos'], ['ayuda.html', 'help', 'Ayuda']];

const pagina = ([archivo, vista, titulo, desc]) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo} – STELLAR VAULT</title>
<meta name="description" content="${desc}">
<script>try{var t=localStorage.getItem("sv_tema");if(!t&&matchMedia("(prefers-color-scheme: dark)").matches)t="dark";if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="preconnect" href="https://accounts.google.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/estilos.css">
</head><body data-page="${vista}">
<a class="skip" href="#app">Saltar al contenido</a>
<header>
 <a class="logo" href="index.html" aria-label="STELLAR VAULT, ir al inicio"><img id="hlogo" alt="" width="48" height="48">STELLAR<b>VAULT</b></a>
 <nav class="mainnav" aria-label="Principal">${NAV.map(([h, v, t]) => `<a href="${h}"${v === vista ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
 <input class="search" id="q" type="search" placeholder="Buscar manga, novela ligera o figura…" aria-label="Buscar productos">
 <div class="uwrap"><button class="ubtn" id="userBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="uMenu"></button><div class="umenu" id="uMenu" role="menu" aria-label="Mi cuenta" hidden></div></div>
 <button class="cartbtn" id="cartBtn" onclick="openCart()"></button>
</header>
<main id="app" tabindex="-1"><div class="panel empty" role="status"><span class="spin"></span> Cargando…</div></main>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<footer>
 <div class="fgrid">
  <section aria-labelledby="f1"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><img id="flogo" alt="" width="44" height="44"><h2 id="f1" style="margin:0">Tienda</h2></div>
   <p>STELLAR VAULT es tu tienda geek de mangas, novelas ligeras y figuras coleccionables. Trabajamos para que encuentres tus series favoritas. Hacemos envíos por Servientrega a todo el Ecuador o puedes retirar tu pedido en tienda.</p></section>
  <nav aria-labelledby="f2"><h2 id="f2">STELLAR VAULT</h2><ul><li><a class="flink" href="index.html">Inicio</a></li><li><a class="flink" href="catalogo.html">Catálogo</a></li><li><a class="flink" href="ofertas.html">Ofertas</a></li><li><a class="flink" href="ayuda.html">Ayuda</a></li><li><a class="flink" href="catalogo.html?disp=pre">Preventas oficiales</a></li><li><a class="flink" href="catalogo.html?cat=f">Figuras coleccionables</a></li></ul></nav>
  <section aria-labelledby="f3"><h2 id="f3">Contacto</h2>
   <dl class="ct"><dt>Email</dt><dd><a class="flink" href="mailto:santiagoquiguango@hotmail.com">santiagoquiguango@hotmail.com</a></dd><dt>Teléfono</dt><dd><a class="flink" href="tel:+59396368732">096368732</a></dd><dt>Dirección</dt><dd>Quito, Ecuador</dd></dl></section>
 </div>
 <div class="fcopy">Copyright © 2026 | STELLAR VAULT</div>
</footer>

<div class="ov" id="drawerOv" onclick="if(event.target===this)closeCart()"><aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="dT"></aside></div>

${vista === 'login' ? '<script src="https://accounts.google.com/gsi/client" async defer></script>\n' : ''}${vista === 'co' ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>\n' : ''}<script src="js/rules.js"></script>
<script src="js/model.js"></script>
<script src="js/view.js"></script>
<script src="js/controller.js"></script>
</body></html>
`;

for (const p of PAGINAS) fs.writeFileSync(path.join(ROOT, p[0]), pagina(p));
console.log('Páginas generadas:', PAGINAS.map(p => p[0]).join(', '));
module.exports = { PAGINAS };
