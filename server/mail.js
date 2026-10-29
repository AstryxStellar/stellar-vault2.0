// Envío de correos por SMTP, sin dependencias. Configuración por variables de entorno o por el archivo server/.env:
//   BREVO_API_KEY + MAIL_FROM (recomendado en la nube)  ó  SMTP_HOST  SMTP_PORT (465 por defecto)  SMTP_USER  SMTP_PASS  MAIL_FROM  SMTP_SECURE (ssl | starttls | none)
// Si no hay SMTP_HOST, el correo NO se envía: se guarda en server/correos/ y el enlace se imprime en la consola del servidor.
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const path = require('path');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const b64 = s => Buffer.from(s).toString('base64');
const cfg = () => ({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465,
  user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-responder@stellarvault.local',
  secure: process.env.SMTP_SECURE || ((Number(process.env.SMTP_PORT) || 465) === 465 ? 'ssl' : 'starttls'),
});

// Lee respuestas SMTP completas (las de varias líneas terminan en "NNN texto" sin guion).
function lector(sock) {
  let buf = '', lineas = [], espera = null; const listas = [];
  sock.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      lineas.push(buf.slice(0, i)); buf = buf.slice(i + 2);
      const ult = lineas[lineas.length - 1];
      if (/^\d{3}( |$)/.test(ult)) {
        const r = { code: Number(ult.slice(0, 3)), text: lineas.join('\n') }; lineas = [];
        if (espera) { const e = espera; espera = null; e.ok(r); } else listas.push(r);
      }
    }
  });
  sock.on('error', e => { if (espera) espera.fail(e); });
  return () => new Promise((ok, fail) => { if (listas.length) ok(listas.shift()); else espera = { ok, fail }; });
}

function conectar(host, port, ssl) {
  return new Promise((ok, fail) => {
    const s = ssl ? tls.connect({ host, port, servername: host }, () => ok(s)) : net.connect({ host, port }, () => ok(s));
    s.once('error', fail); s.setTimeout(20000, () => s.destroy(new Error('Tiempo de espera agotado con el servidor SMTP')));
  });
}

async function enviarSmtp(c, { to, subject, html }) {
  let sock = await conectar(c.host, c.port, c.secure === 'ssl');
  let leer = lector(sock);
  const cmd = async (linea, ok) => {
    if (linea) sock.write(linea + '\r\n');
    const r = await leer();
    if (!ok.includes(r.code)) throw new Error('SMTP ' + r.text);
    return r;
  };
  try {
    await cmd(null, [220]);
    await cmd('EHLO stellarvault', [250]);
    if (c.secure === 'starttls') {
      await cmd('STARTTLS', [220]);
      sock = tls.connect({ socket: sock, servername: c.host });
      leer = lector(sock);
      await cmd('EHLO stellarvault', [250]);
    }
    if (c.user) { await cmd('AUTH LOGIN', [334]); await cmd(b64(c.user), [334]); await cmd(b64(c.pass || ''), [235]); }
    const from = c.from.match(/<(.+)>/)?.[1] || c.from;
    await cmd(`MAIL FROM:<${from}>`, [250]);
    await cmd(`RCPT TO:<${to}>`, [250, 251]);
    await cmd('DATA', [354]);
    const msg = [
      `From: ${c.from}`, `To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '',
      b64(html).replace(/(.{76})/g, '$1\r\n'), '.',
    ].join('\r\n');
    await cmd(msg, [250]);
    sock.write('QUIT\r\n');
  } finally { sock.end(); }
}

// Brevo (https://www.brevo.com, plan gratis): se usa cuando existe BREVO_API_KEY. MAIL_FROM = "Nombre <correo-verificado@dominio>".
async function enviarBrevo({ to, subject, html }) {
  const from = process.env.MAIL_FROM || '';
  const m = from.match(/^\s*(.*?)\s*<(.+)>\s*$/);
  const sender = m ? { name: m[1] || 'STELLAR VAULT', email: m[2] } : { name: 'STELLAR VAULT', email: from };
  if (!sender.email) throw new Error('Falta MAIL_FROM (el remitente verificado en Brevo)');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!r.ok) throw new Error('Brevo ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// Devuelve { simulado: boolean }. Lanza error si el SMTP configurado falla.
async function enviarCorreo({ to, subject, html, enlace }) {
  if (process.env.BREVO_API_KEY) { await enviarBrevo({ to, subject, html }); return { simulado: false }; }
  const c = cfg();
  if (!c.host) {
    const dir = path.join(__dirname, 'correos');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, '_')}.html`);
    fs.writeFileSync(f, `<!-- Para: ${to} · Asunto: ${subject} -->\n${html}`);
    console.log(`\n[correo simulado] Para: ${to}\n  Asunto: ${subject}\n  Enlace: ${enlace}\n  Archivo: ${f}\n  (Configura SMTP_HOST para enviarlo de verdad)\n`);
    return { simulado: true };
  }
  await enviarSmtp(c, { to, subject, html });
  return { simulado: false };
}

module.exports = { enviarCorreo };
