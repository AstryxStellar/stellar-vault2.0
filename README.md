# STELLAR VAULT

Tienda de mangas, novelas ligeras y figuras. Node.js + SQLite (archivo local) o Turso (nube).

## Probarla en tu compu
Doble clic en `iniciar.bat` (la primera vez instala las dependencias) y se abre http://localhost:3000.
Sin configuración extra, usa un archivo local `server/tienda.db`.

## Publicarla con un link (para entrar desde cualquier dispositivo)

### 1. Subir el código a GitHub
Sube el contenido de la carpeta (incluido `package.json` y `package-lock.json`). **No** subas `node_modules`
(el `.gitignore` ya lo evita) ni `server/tienda.db` ni `server/.env`.

### 2. Base de datos en la nube con Turso (para que los datos NO se borren)
Render gratis reinicia el disco cada vez que la tienda se duerme o se actualiza; por eso los comentarios, fotos y
usuarios nuevos se perdían. Turso guarda la base fuera de Render.
1. Crea una cuenta en https://turso.tech (gratis).
2. Crea una base de datos (cualquier nombre, por ejemplo `stellar-vault`).
3. Copia su **URL** (empieza con `libsql://`) y crea un **token de acceso** para esa base (opción de crear token / Generate token).
4. En Render → tu servicio → **Environment**, agrega:
   - `TURSO_DATABASE_URL` = la URL `libsql://...`
   - `TURSO_AUTH_TOKEN` = el token
5. Guarda y espera el redeploy. La primera vez crea las tablas y carga los datos de ejemplo; desde ahí los datos se conservan.

Si cambias el esquema (`server/schema.sql`) y quieres empezar de cero, pon `RESET_DB=1` en Render, espera el deploy,
y **quita** esa variable después (si la dejas, se borra todo en cada reinicio).

### 3. Correo de verificación con Brevo (gratis)
1. Crea una cuenta en https://www.brevo.com y verifica **un correo remitente**.
2. Crea una clave de API con permiso *Transactional email* (empieza con `xkeysib-`).
3. En Render agrega `BREVO_API_KEY` y `MAIL_FROM` (`STELLAR VAULT <tu-correo-verificado@ejemplo.com>`).

### 4. Inicio de sesión con Google (opcional)
Crea un ID de cliente OAuth (aplicación web) en Google Cloud, agrega tu link de Render como origen autorizado de
JavaScript y pon el ID en la variable `GOOGLE_CLIENT_ID`.

### 5. Publicar en Render (gratis)
New → Web Service → tu repositorio. Build `npm install`, Start `npm start`, Health Check `/api/health`,
y las variables de entorno de arriba (`NODE_VERSION` = `24`).

### 6. Que no se "duerma"
Monitor gratis en https://uptimerobot.com a `https://TU-LINK/api/health` cada 5 minutos.

### Usuarios de ejemplo
`ana.perez@correo.com` / `Demo1234` (ya verificado).

### Estructura del proyecto
```
index.html            Inicio            catalogo.html   Catálogo          producto.html  Detalle (?id=)
favoritos.html        Favoritos         pedidos.html    Mis pedidos       pagar.html     Pago y confirmación
ingresar.html         Iniciar sesión    perfil.html     Mi perfil         ayuda.html     Ayuda
ofertas.html          Ofertas (packs y rebajas)
css/estilos.css       guía de estilo (colores, tipografía, componentes, modo oscuro)
js/                   model.js · view.js · controller.js (MVC) y rules.js (validaciones y descuento por packs)
server/               server.js (API), db.js, schema.sql, seed.js (datos), mail.js (correos)
img/                  fotos: <producto>-frente.jpg (portadas y figuras) y <producto>-atras.jpg (figuras)
tools/                paginas.js (genera las 10 páginas HTML con el mismo encabezado y pie) · portadas.js (descarga portadas) · generar-imagenes.js y prompts-figuras.md (figuras)
```

### Administración (otra aplicación): `TU-LINK/admin/`
Se entra con la clave de la variable `ADMIN_CLAVE` (en Render → Environment; en tu compu, en `server/.env`).
- **Productos (CRUD):** crear, editar, dar de baja (deja de verse en la tienda, se conserva el historial),
  reactivar y eliminar (solo si nunca se vendió).
- **Stock:** ingreso (+), devolución (+), salida por daño o pérdida (−) y ajuste por conteo. Cada cambio queda en la
  tabla `movimientos_stock` con su motivo; la base no deja el stock en negativo.
- **Pedidos y pago en tienda:** ver la orden de pedido (e imprimirla), registrar el pago en efectivo con el monto
  recibido (calcula el cambio y rechaza un pago incompleto), marcar como entregado, cancelar con motivo
  (no se presentó, pago incompleto, producto dañado…) o registrar una devolución. Al cancelar o devolver,
  el trigger `trg_pedido_cancelado` devuelve el stock solo.

### Dónde se guarda un pedido
| Tabla | Qué guarda |
|---|---|
| `pedidos` | N.º de orden (`#SV-2026-XXXX`), cliente, entrega, subtotal, descuento, envío, total, estado, pagado, entregado |
| `pedido_items` | cada producto del pedido con cantidad y precio unitario |
| `pagos` | método (efectivo, DeUna botón o QR), estado del cobro y motivo (rechazo, cambio, devolución) |
| `movimientos_stock` | entradas y salidas de inventario hechas desde la administración |

### Página siempre activa
En Render, el servidor se visita solo cada 10 minutos (usa `RENDER_EXTERNAL_URL`, que Render pone automáticamente),
así el plan gratis no lo apaga. Como respaldo, configura UptimeRobot a `https://TU-LINK/api/health` cada 5 minutos.
El plan gratis da 750 horas al mes: alcanza para tener un servicio encendido todo el mes.

### Ofertas y envío
- Envío gratis desde **$80** (tabla `configuracion`).
- **Packs** (tablas `packs` y `pack_items`, lista `PACKS` en `server/seed.js`): 16 packs de una misma serie (figuras + libros, 37 productos en total)
  con un 12 % o 15 % de descuento. Si el carrito tiene todos los productos de un pack, el descuento se aplica solo
  (función `descuentoPacks` de `js/rules.js`, la usan el carrito y el servidor) y queda guardado en `pedidos.descuento`.
- **Rebajas** en 16 productos de las tres categorías (columna `productos.precio_antes`, lista `REBAJAS`):
  `precio` ya es el precio rebajado y `precio_antes` el original (se muestra tachado con el % de descuento).
  Los packs y las rebajas se editan desde la administración (pestaña «Packs» y campo «Precio anterior»).
- Página **Ofertas** (`ofertas.html`) con los dos tipos; el inicio muestra **En rebaja**, **Packs** y **Los más comprados**
  (suma de unidades en pedidos no cancelados). El catálogo tiene los filtros «En pack» y «Rebajas».
- Al arrancar, el servidor actualiza solo el catálogo de una base ya creada (Turso): renombra los títulos
  cambiados, agrega los nuevos, marca las ofertas y fija el envío gratis, **sin borrar** usuarios, pedidos ni comentarios.

### Fotos de las figuras (frente y atrás)
Las fotos viven en la carpeta `img/`, con el nombre `<producto>-frente.jpg` y `<producto>-atras.jpg`
(por ejemplo `furina-1-7-genshin-impact-frente.jpg`). Al arrancar, el servidor las enlaza solo con cada producto.
- Con la API de Gemini: `node tools/generar-imagenes.js --prueba` (una figura) y luego `node tools/generar-imagenes.js`.
  Necesita la variable `GEMINI_API_KEY` y la API de imágenes de Gemini es de pago.
- A mano en la app de Gemini: `node tools/generar-imagenes.js --prompts` crea `tools/prompts-figuras.md` con los textos.
Después sube la carpeta `img/` a GitHub.