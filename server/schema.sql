-- STELLAR VAULT · esquema SQLite
-- Las reglas de validación viven aquí (CHECK, UNIQUE, FOREIGN KEY, triggers y la tabla reglas_validacion),
-- no en el código de la aplicación.
PRAGMA foreign_keys = ON;

-- Parámetros de la tienda (antes estaban escritos a mano en el código)
CREATE TABLE configuracion (
  clave  TEXT PRIMARY KEY CHECK (length(clave) BETWEEN 2 AND 40),
  valor  REAL NOT NULL CHECK (valor >= 0),
  detalle TEXT NOT NULL
);

CREATE TABLE categorias (
  id      INTEGER PRIMARY KEY,
  codigo  TEXT NOT NULL UNIQUE CHECK (codigo IN ('m','n','f')),
  nombre  TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) >= 3),
  plural  TEXT NOT NULL UNIQUE CHECK (length(trim(plural)) >= 3),
  orden   INTEGER NOT NULL UNIQUE CHECK (orden > 0)
);

CREATE TABLE productos (
  id           INTEGER PRIMARY KEY,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  nombre       TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) BETWEEN 2 AND 120),
  autor        TEXT NOT NULL CHECK (length(trim(autor)) >= 2),
  editorial    TEXT NOT NULL CHECK (length(trim(editorial)) >= 2),
  precio       REAL NOT NULL CHECK (precio > 0 AND precio <= 10000),
  stock        INTEGER NOT NULL CHECK (stock >= 0 AND stock <= 9999),
  color        TEXT NOT NULL CHECK (color  GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  tinte        TEXT NOT NULL CHECK (tinte  GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  tinte_texto  TEXT NOT NULL CHECK (tinte_texto GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  preventa     TEXT CHECK (preventa IS NULL OR length(trim(preventa)) >= 3),
  destacado    INTEGER NOT NULL DEFAULT 0 CHECK (destacado IN (0,1)),
  promo        TEXT CHECK (promo IS NULL OR promo = '3x2'), -- oferta 3x2 en figuras elegidas
  precio_antes REAL CHECK (precio_antes IS NULL OR precio_antes > precio), -- rebaja: precio anterior (precio ya es el rebajado)
  descripcion  TEXT NOT NULL CHECK (length(trim(descripcion)) >= 10)
);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);

CREATE TABLE imagenes_producto (
  id          INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url         TEXT NOT NULL CHECK (url LIKE 'http%' OR url LIKE 'img/%'),
  orden       INTEGER NOT NULL DEFAULT 1 CHECK (orden >= 1),
  UNIQUE (producto_id, orden)
);

CREATE TABLE provincias (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) >= 4)
);
CREATE TABLE ciudades (
  id           INTEGER PRIMARY KEY,
  provincia_id INTEGER NOT NULL REFERENCES provincias(id),
  nombre       TEXT NOT NULL CHECK (length(trim(nombre)) >= 3),
  UNIQUE (provincia_id, nombre)
);

CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY,
  nombre        TEXT NOT NULL CHECK (length(trim(nombre)) BETWEEN 2 AND 80),
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE
                CHECK (email LIKE '_%@_%._%' AND email NOT LIKE '% %' AND length(email) <= 120),
  password_hash TEXT NOT NULL CHECK (length(password_hash) >= 64),
  verificado    INTEGER NOT NULL DEFAULT 0 CHECK (verificado IN (0,1)),
  registro      TEXT NOT NULL DEFAULT 'correo' CHECK (registro IN ('correo','google')),
  telefono      TEXT CHECK (telefono IS NULL OR (telefono NOT GLOB '*[^0-9]*' AND length(telefono) BETWEEN 7 AND 10)),
  provincia_id  INTEGER REFERENCES provincias(id),
  ciudad_id     INTEGER REFERENCES ciudades(id),
  direccion     TEXT CHECK (direccion IS NULL OR length(trim(direccion)) >= 5),
  foto_google   TEXT CHECK (foto_google IS NULL OR (foto_google LIKE 'https://%' AND length(foto_google) < 500)),
  foto_subida   TEXT CHECK (foto_subida IS NULL OR (foto_subida LIKE 'data:image/%;base64,%' AND length(foto_subida) <= 150000)),
  creado        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Enlaces de verificación de correo que se envían al registrarse
CREATE TABLE verificaciones (
  token      TEXT PRIMARY KEY CHECK (length(token) = 64),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira     TEXT NOT NULL
);

CREATE TABLE favoritos (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  fecha       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (usuario_id, producto_id)
);

CREATE TABLE sesiones (
  token      TEXT PRIMARY KEY CHECK (length(token) = 64),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE pedidos (
  id            INTEGER PRIMARY KEY,
  numero        TEXT NOT NULL UNIQUE CHECK (numero LIKE '#SV-____-____'),
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id), -- solo compran usuarios registrados
  nombre        TEXT NOT NULL CHECK (length(trim(nombre)) >= 5),
  telefono      TEXT NOT NULL CHECK (telefono NOT GLOB '*[^0-9]*' AND length(telefono) BETWEEN 7 AND 10),
  email         TEXT NOT NULL CHECK (email LIKE '_%@_%._%' AND email NOT LIKE '% %'),
  entrega       TEXT NOT NULL CHECK (entrega IN ('envio','retiro')),
  metodo_pago   TEXT NOT NULL CHECK (metodo_pago IN ('fisico','deuna')),
  provincia_id  INTEGER REFERENCES provincias(id),
  ciudad_id     INTEGER REFERENCES ciudades(id),
  direccion     TEXT,
  tipo_vivienda TEXT NOT NULL DEFAULT 'Casa' CHECK (tipo_vivienda IN ('Casa','Departamento','Oficina')),
  edificio      TEXT,
  piso          TEXT,
  unidad        TEXT,
  referencia    TEXT,
  subtotal      REAL NOT NULL CHECK (subtotal > 0), -- ya con la promo 3x2 descontada
  descuento     REAL NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  envio         REAL NOT NULL CHECK (envio >= 0),
  total         REAL NOT NULL CHECK (total > 0),
  pagado        INTEGER NOT NULL DEFAULT 0 CHECK (pagado IN (0,1)),
  estado        TEXT NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('pendiente_pago','confirmado','cancelado')),
  fecha         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (abs(total - (subtotal + envio)) < 0.005),
  CHECK (entrega = 'retiro' OR (provincia_id IS NOT NULL AND ciudad_id IS NOT NULL AND length(trim(direccion)) >= 5)),
  CHECK (entrega = 'retiro' OR tipo_vivienda = 'Casa' OR (length(trim(piso)) >= 1 AND length(trim(unidad)) >= 1)),
  CHECK (entrega = 'envio' OR envio = 0)
);

CREATE TABLE pedido_items (
  id              INTEGER PRIMARY KEY,
  pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  cantidad        INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 99),
  precio_unitario REAL NOT NULL CHECK (precio_unitario > 0),
  UNIQUE (pedido_id, producto_id)
);

-- Un registro por pedido: aquí vive el estado del cobro (botón DeUna, QR DeUna o pago en físico).
CREATE TABLE pagos (
  id        INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
  token     TEXT NOT NULL UNIQUE CHECK (length(token) = 48),
  metodo    TEXT NOT NULL CHECK (metodo IN ('fisico','deuna_boton','deuna_qr')),
  monto     REAL NOT NULL CHECK (monto > 0),
  estado    TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','cancelado','expirado')),
  motivo    TEXT,
  creado    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expira    TEXT NOT NULL,
  resuelto  TEXT,
  CHECK (estado = 'pendiente' OR resuelto IS NOT NULL)
);

CREATE TABLE comentarios (
  id          INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, -- solo comentan usuarios con sesión
  autor       TEXT NOT NULL CHECK (length(trim(autor)) BETWEEN 2 AND 80),
  calificacion INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  texto       TEXT NOT NULL CHECK (length(trim(texto)) BETWEEN 3 AND 500),
  fecha       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_comentarios_producto ON comentarios(producto_id);

-- Reglas que el formulario aplica a cada campo. El navegador y el servidor las leen de aquí.
-- tipo: regex | minlen | maxlen | requerido | rango     condicion: NULL o 'campo=valor' / 'campo<>valor'
CREATE TABLE reglas_validacion (
  id        INTEGER PRIMARY KEY,
  ambito    TEXT NOT NULL CHECK (ambito IN ('checkout','registro','login','comentario','perfil','clave')),
  campo     TEXT NOT NULL CHECK (length(campo) >= 2),
  tipo      TEXT NOT NULL CHECK (tipo IN ('regex','minlen','maxlen','requerido','rango')),
  valor     TEXT,
  condicion TEXT,
  mensaje   TEXT NOT NULL CHECK (length(trim(mensaje)) >= 5),
  CHECK (tipo = 'requerido' OR valor IS NOT NULL)
);

-- ---------- Triggers de integridad ----------
-- La ciudad debe pertenecer a la provincia elegida.
CREATE TRIGGER trg_pedido_ciudad_provincia
BEFORE INSERT ON pedidos
WHEN NEW.ciudad_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'La ciudad no pertenece a la provincia')
  WHERE (SELECT provincia_id FROM ciudades WHERE id = NEW.ciudad_id) IS NOT NEW.provincia_id;
END;

-- La ciudad del perfil debe pertenecer a su provincia.
CREATE TRIGGER trg_usuario_ciudad_provincia
BEFORE UPDATE OF ciudad_id, provincia_id ON usuarios
WHEN NEW.ciudad_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'La ciudad no pertenece a la provincia')
  WHERE (SELECT provincia_id FROM ciudades WHERE id = NEW.ciudad_id) IS NOT NEW.provincia_id;
END;

-- No se puede pedir más que el stock (las preventas no tienen límite de stock).
CREATE TRIGGER trg_item_stock
BEFORE INSERT ON pedido_items
BEGIN
  SELECT RAISE(ABORT, 'Stock insuficiente')
  WHERE (SELECT preventa FROM productos WHERE id = NEW.producto_id) IS NULL
    AND NEW.cantidad > (SELECT stock FROM productos WHERE id = NEW.producto_id);
END;

-- Descuenta el stock al registrar el artículo.
CREATE TRIGGER trg_item_descuenta
AFTER INSERT ON pedido_items
BEGIN
  UPDATE productos SET stock = stock - NEW.cantidad
  WHERE id = NEW.producto_id AND preventa IS NULL;
END;

-- El precio del artículo debe coincidir con el precio del producto.
CREATE TRIGGER trg_item_precio
BEFORE INSERT ON pedido_items
BEGIN
  SELECT RAISE(ABORT, 'El precio no coincide con el producto')
  WHERE NEW.precio_unitario <> (SELECT precio FROM productos WHERE id = NEW.producto_id);
END;

-- Si un pedido se cancela (pago rechazado, cancelado o vencido) se devuelve el stock.
CREATE TRIGGER trg_pedido_cancelado
AFTER UPDATE OF estado ON pedidos
WHEN NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado'
BEGIN
  UPDATE productos
  SET stock = stock + (SELECT cantidad FROM pedido_items WHERE pedido_id = NEW.id AND producto_id = productos.id)
  WHERE preventa IS NULL AND id IN (SELECT producto_id FROM pedido_items WHERE pedido_id = NEW.id);
END;

-- Un pedido cancelado no puede reactivarse.
CREATE TRIGGER trg_pedido_no_reactivar
BEFORE UPDATE OF estado ON pedidos
WHEN OLD.estado = 'cancelado' AND NEW.estado <> 'cancelado'
BEGIN
  SELECT RAISE(ABORT, 'Un pedido cancelado no se puede reactivar');
END;
