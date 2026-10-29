# STELLAR VAULT

Tienda de mangas, novelas ligeras y figuras. Node.js + SQLite, sin dependencias.

## Probarla en tu compu
Doble clic en `iniciar.bat` (o `npm start`) y abre http://localhost:3000.

## Publicarla con un link (para entrar desde cualquier dispositivo)

### 1. Subir el código a GitHub
1. Crea una cuenta en https://github.com y un repositorio nuevo (ej. `stellar-vault`).
2. Sube **todo el contenido de esta carpeta** (el archivo `.gitignore` ya evita subir la base de datos y tus claves).

### 2. Correo de verificación con Brevo (gratis)
1. Crea una cuenta en https://www.brevo.com.
2. En *Senders & IP* agrega y verifica **un correo remitente** tuyo (te llega un mensaje de confirmación).
3. En *SMTP & API → API keys* crea una clave y cópiala.

### 3. Publicar en Render (gratis)
1. Crea una cuenta en https://render.com e ingresa con GitHub.
2. *New → Blueprint* (o *Web Service*) y elige tu repositorio. Render lee `render.yaml`.
3. En las variables de entorno completa:
   - `BREVO_API_KEY` = la clave de Brevo
   - `MAIL_FROM` = `STELLAR VAULT <tu-correo-verificado@ejemplo.com>`
4. Al terminar, Render te da el link `https://stellar-vault-xxxx.onrender.com`. Ese es el link para compartir.

### 4. Que no se "duerma"
El plan gratis de Render apaga la página tras ~15 min sin visitas y tarda ~1 min en despertar.
Para evitarlo crea un monitor gratis en https://uptimerobot.com: tipo HTTP(s), URL `https://TU-LINK/api/health`, cada 5 minutos.

### Importante
- En el plan gratis los datos (usuarios y pedidos nuevos) se reinician a los de ejemplo cuando el servicio se reinicia.
- Usuarios de ejemplo ya verificados: `ana.perez@correo.com` / `Demo1234`.
