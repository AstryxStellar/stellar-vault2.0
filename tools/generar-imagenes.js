// Genera las fotos de las figuras (frente y atrás) con la API de Gemini y las guarda en img/.
// Uso (en la carpeta del proyecto):
//   $env:GEMINI_API_KEY = "tu_clave"        (PowerShell)     |     set GEMINI_API_KEY=tu_clave   (CMD)
//   node tools/generar-imagenes.js --prueba          genera solo 1 figura para revisar el resultado
//   node tools/generar-imagenes.js                   genera todas las que falten (se salta las que ya existen)
//   node tools/generar-imagenes.js --solo "furina"   solo las figuras cuyo nombre contenga ese texto
//   node tools/generar-imagenes.js --prompts         solo escribe tools/prompts-figuras.md (para pegarlos en la app de Gemini)
// La clave se lee de la variable de entorno (o de tools/.env) y nunca se escribe en ningún archivo del proyecto.
const fs = require('fs');
const path = require('path');
const { productosSemilla } = require('../server/seed');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'img');
const slug = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const valor = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const MODELO = process.env.GEMINI_MODEL || 'gemini-nano-banana-2.1';
const URL_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const figuras = productosSemilla().filter(p => p.cat === 'f')
  .filter(p => !valor('--solo') || slug(p.nombre).includes(slug(valor('--solo'))));

const promptFrente = n => `Professional e-commerce product photograph of a 1/7 scale PVC collectible anime figure: "${n}". `
  + 'Front view, full figure standing on its round display base, centered, sharp focus, soft studio lighting, clean pure white background, '
  + 'high detail, realistic paint and plastic finish. No text, no logos, no watermark, no packaging, no hands.';
const promptAtras = n => `This is the front view of the collectible figure "${n}". Generate the SAME exact figure seen from directly BEHIND (back view): `
  + 'same pose, same outfit, same colors, same base, same studio lighting and the same clean pure white background. '
  + 'Show the back of the hair, clothing and accessories. No text, no logos, no watermark.';

if (flag('--prompts')) {
  const md = ['# Prompts para generar las figuras en la app de Gemini', '',
    'Para cada figura: 1) pega el prompt de FRENTE y descarga la imagen; 2) en el mismo chat, sube esa imagen y pega el prompt de ATRÁS.',
    'Guarda los archivos en la carpeta `img/` con el nombre indicado (`-frente.jpg` y `-atras.jpg`).', '']
    .concat(figuras.flatMap(p => [`## ${p.nombre}`, `Archivos: \`${slug(p.nombre)}-frente.jpg\` y \`${slug(p.nombre)}-atras.jpg\``, '', '**Frente:**', '```', promptFrente(p.nombre), '```', '**Atrás (adjunta la imagen del frente):**', '```', promptAtras(p.nombre), '```', '']));
  fs.writeFileSync(path.join(__dirname, 'prompts-figuras.md'), md.join('\n'));
  console.log(`Escribí tools/prompts-figuras.md con ${figuras.length} figuras.`);
  process.exit(0);
}

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('Falta la variable GEMINI_API_KEY (tu clave de Google AI Studio). Mira las instrucciones al inicio de este archivo.'); process.exit(1); }

// Busca en cualquier parte de la respuesta un bloque de imagen con datos en base64.
function buscarImagen(o) {
  if (!o || typeof o !== 'object') return null;
  if ((o.type === 'image' && typeof o.data === 'string' && o.data.length > 100)) return { data: o.data, mime: o.mime_type || 'image/png' };
  if (o.inlineData && o.inlineData.data) return { data: o.inlineData.data, mime: o.inlineData.mimeType || 'image/png' };
  for (const v of Object.values(o)) { const r = buscarImagen(v); if (r) return r; }
  return null;
}
async function pedir(input, conFormato) {
  const body = { model: MODELO, input };
  if (conFormato) body.response_format = { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '3:4' };
  const r = await fetch(URL_API, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}: ${txt.slice(0, 300).replace(KEY, '***')}`), { status: r.status });
  const img = buscarImagen(JSON.parse(txt));
  if (!img) throw new Error('La respuesta no trajo ninguna imagen: ' + txt.slice(0, 200));
  return img;
}
async function generar(input) {
  for (let intento = 1; intento <= 3; intento++) {
    try { try { return await pedir(input, true); } catch (e) { if (e.status === 400) return await pedir(input, false); throw e; } }
    catch (e) { if (intento === 3 || [401, 403].includes(e.status)) throw e; console.log('   reintentando…', e.message.slice(0, 80)); await new Promise(r => setTimeout(r, 4000 * intento)); }
  }
}
const ext = mime => (/png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : 'jpg');
const existe = base => ['jpg', 'jpeg', 'png', 'webp'].map(e => `${base}.${e}`).find(f => fs.existsSync(path.join(OUT, f)));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let lista = figuras;
  if (flag('--prueba')) lista = lista.slice(0, 1);
  const pendientes = lista.filter(p => !existe(slug(p.nombre) + '-frente') || !existe(slug(p.nombre) + '-atras'));
  console.log(`Modelo: ${MODELO} · figuras por hacer: ${pendientes.length} de ${lista.length} (2 imágenes cada una).`);
  console.log('Recuerda: la API de imágenes de Gemini es de pago (aprox. 0.03–0.07 USD por imagen según el modelo).');
  let ok = 0;
  for (const p of pendientes) {
    const base = slug(p.nombre);
    try {
      console.log(`→ ${p.nombre}`);
      let frente = existe(base + '-frente');
      let datosFrente;
      if (!frente) {
        const f = await generar([{ type: 'text', text: promptFrente(p.nombre) }]);
        frente = `${base}-frente.${ext(f.mime)}`; fs.writeFileSync(path.join(OUT, frente), Buffer.from(f.data, 'base64')); datosFrente = f;
        console.log('   frente ✓');
      } else datosFrente = { data: fs.readFileSync(path.join(OUT, frente)).toString('base64'), mime: frente.endsWith('png') ? 'image/png' : frente.endsWith('webp') ? 'image/webp' : 'image/jpeg' };
      const a = await generar([{ type: 'text', text: promptAtras(p.nombre) }, { type: 'image', mime_type: datosFrente.mime, data: datosFrente.data }]);
      fs.writeFileSync(path.join(OUT, `${base}-atras.${ext(a.mime)}`), Buffer.from(a.data, 'base64'));
      console.log('   atrás ✓'); ok++;
    } catch (e) { console.error(`   ✗ ${p.nombre}: ${e.message}`); if ([401, 403].includes(e.status)) { console.error('La clave no es válida o no tiene facturación activada para imágenes. Me detengo.'); break; } }
  }
  console.log(`Listo: ${ok} figura(s) generada(s). Revisa la carpeta img/ y súbela a GitHub.`);
})();
