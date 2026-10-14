const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
// CSP deshabilitado: index.html carga Chart.js desde CDN y usa
// onclick="" inline en (casi) toda la UI (ver CLAUDE.md) — una CSP por
// defecto rompería la app. El resto de cabeceras de helmet (nosniff,
// frameguard, HSTS, etc.) sí aplican.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Rate limit por IP en /api/login, además del lockout por-usuario de más
// abajo — evita fuerza bruta rotando `userId` o probando PINs desde muchas
// cuentas a la vez desde la misma IP.
app.use('/api/login', rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Intenta de nuevo en unos minutos.' }
}));

// Allowlist explícito de lo que es realmente frontend público — NUNCA
// express.static(__dirname) directo: eso serviría también server.js,
// database.sqlite (PINs, datos de clientes), package.json, node_modules/,
// android/ (proyecto fuente aparte) y cualquier otro archivo del repo con
// solo pedirlo por URL.
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));

// DB_PATH configurable (p. ej. dentro de un volumen Docker); por defecto
// mantiene el comportamiento histórico de vivir junto al código.
const dbFile = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new sqlite3.Database(dbFile);

// Inicializar tabla (Almacenamiento tipo Documento / Key-Value)
db.serialize(() => {
  // WAL: los lectores (ej. un backup en curso) no bloquean a los
  // escritores ni viceversa, y es más resistente a corrupción ante un
  // corte de luz/reinicio abrupto que el journal por defecto.
  db.run('PRAGMA journal_mode = WAL');
  db.run(`CREATE TABLE IF NOT EXISTS store (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  // Pedidos archivados (ver archiveOldOrders más abajo) — fuera del store
  // genérico a propósito, para que nunca viajen en /api/state.
  db.run(`CREATE TABLE IF NOT EXISTS archived_orders (
    id TEXT PRIMARY KEY,
    data TEXT,
    archived_at TEXT
  )`);
});

/* ═══════════════════════════════════════════════════════════
   Backups automáticos — NUNCA en una carpeta servida por HTTP (ver el
   allowlist de arriba: backups/ no está ahí a propósito).
   ═══════════════════════════════════════════════════════════ */
const BACKUP_DIR = process.env.BACKUPS_DIR || path.join(__dirname, 'backups');
const MAX_BACKUPS = 14; // ~2 semanas corriendo 1x/día
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const runBackup = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `database-${stamp}.sqlite`);
  // VACUUM INTO: copia consistente incluso con escrituras concurrentes,
  // a diferencia de copiar el archivo .sqlite crudo mientras se usa.
  db.run('VACUUM INTO ?', [dest], (err) => {
    if (err) { console.error('Backup de BD falló:', err.message); return; }
    console.log(`💾 Backup creado: backups/${path.basename(dest)}`);
    fs.readdir(BACKUP_DIR, (readErr, files) => {
      if (readErr) return;
      const backups = files.filter(f => f.startsWith('database-') && f.endsWith('.sqlite')).sort();
      const excess = backups.length - MAX_BACKUPS;
      for (let i = 0; i < excess; i++) fs.unlink(path.join(BACKUP_DIR, backups[i]), () => {});
    });
  });
};

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(runBackup, BACKUP_INTERVAL_MS);
runBackup(); // uno al arrancar, para tener una copia reciente sin esperar 24h

/* ═══════════════════════════════════════════════════════════
   Helpers sobre el store genérico
   ═══════════════════════════════════════════════════════════ */
const getStoreValue = (key) => new Promise((resolve, reject) => {
  db.get('SELECT value FROM store WHERE key = ?', [key], (err, row) => {
    if (err) return reject(err);
    if (!row) return resolve(null);
    try { resolve(JSON.parse(row.value)); } catch (e) { resolve(row.value); }
  });
});

const setStoreValue = (key, value) => new Promise((resolve, reject) => {
  const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  db.run(`INSERT INTO store (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, strValue], (err) => err ? reject(err) : resolve());
});

/* ═══════════════════════════════════════════════════════════
   Auth: sesiones en memoria + PIN validado en el servidor.
   Los PINs viven solo aquí — nunca se transmiten en /api/state.
   ═══════════════════════════════════════════════════════════ */
// PINs de arranque configurables por entorno — solo se usan para sembrar la
// tabla `users` la primera vez que arranca el servidor con una base vacía.
// No se incluyen credenciales por defecto en el código.
const DEFAULT_USERS = [
  { id: 'u1', name: 'Administrador', role: 'admin', pin: process.env.ADMIN_PIN, active: true, initials: 'AD', color: 'red' },
  { id: 'u2', name: 'Cajero', role: 'cashier', pin: process.env.CASHIER_PIN, active: true, initials: 'CJ', color: 'blue' }
];

const getOrSeedUsers = async () => {
  let users = await getStoreValue('users');
  if (users) return users;

  const pinPattern = /^\d{4}$/;
  if (!pinPattern.test(process.env.ADMIN_PIN || '') || !pinPattern.test(process.env.CASHIER_PIN || '')) {
    throw new Error('Define ADMIN_PIN y CASHIER_PIN como PIN numéricos de 4 dígitos antes del primer inicio con una base vacía.');
  }

  users = DEFAULT_USERS;
  await setStoreValue('users', users);
  return users;
};

const sessions = new Map(); // token -> { userId, role, name, expiresAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h, cubre un turno largo

const loginAttempts = new Map(); // userId -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

const createSession = (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, role: user.role, name: user.name, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
};

// Limpieza periódica de sesiones vencidas
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) if (s.expiresAt < now) sessions.delete(token);
}, 60 * 60 * 1000);

const requireAuth = (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
  req.session = session;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
};

// GET /api/login-users - lista pública mínima (sin PIN) para la pantalla de selección de usuario.
// Si la base está vacía (primer arranque), siembra los usuarios por defecto aquí mismo.
app.get('/api/login-users', async (req, res) => {
  try {
    const users = await getOrSeedUsers();
    const publicList = users
      .filter(u => u.active !== false)
      .map(u => ({ id: u.id, name: u.name, role: u.role, initials: u.initials, color: u.color }));
    res.json(publicList);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// POST /api/login - valida el PIN contra la base y emite un token de sesión.
app.post('/api/login', async (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin) return res.status(400).json({ error: 'Faltan credenciales' });

  const attempt = loginAttempts.get(userId);
  if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
    const waitSec = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Demasiados intentos. Espera ${waitSec}s.` });
  }

  try {
    const users = await getOrSeedUsers();
    const user = users.find(u => u.id === userId && u.active !== false);

    if (!user || user.pin !== pin) {
      const next = { count: (attempt?.count || 0) + 1, lockedUntil: null };
      if (next.count >= MAX_ATTEMPTS) next.lockedUntil = Date.now() + LOCKOUT_MS;
      loginAttempts.set(userId, next);
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    loginAttempts.delete(userId);
    const token = createSession(user);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, initials: user.initials, color: user.color } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// POST /api/logout
app.post('/api/logout', requireAuth, (req, res) => {
  const token = (req.headers['authorization'] || '').slice(7);
  sessions.delete(token);
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════════════════
   Operaciones atómicas — evitan las condiciones de carrera del
   modelo "última escritura gana" del store genérico cuando dos
   tablets tocan lo mismo dentro de la misma ventana de poll (5s).
   ═══════════════════════════════════════════════════════════ */

// POST /api/next-order-number - incrementa el contador en una sola
// sentencia SQL (INSERT..ON CONFLICT..RETURNING), sin round-trip
// lectura+escritura desde Node — dos requests concurrentes nunca
// pueden ver el mismo número.
app.post('/api/next-order-number', requireAuth, (req, res) => {
  db.get(
    `INSERT INTO store (key, value) VALUES ('orderCounter', '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(store.value AS INTEGER) + 1 AS TEXT)
     RETURNING value`,
    [],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error de base de datos' });
      }
      res.json({ number: parseInt(row.value, 10) });
    }
  );
});

// Lock en memoria por key, para compuestos leer-array+decidir+escribir-array
// que no son expresables en una sola sentencia SQL (el array vive como JSON
// en una sola columna). Serializa las operaciones sobre la MISMA key sin
// bloquear las de otras keys entre sí.
const _keyLocks = new Map(); // key -> promesa encadenada
const withKeyLock = (key, fn) => {
  const prev = _keyLocks.get(key) || Promise.resolve();
  const result = prev.then(fn, fn);
  _keyLocks.set(key, result.then(() => {}, () => {}));
  return result;
};

// POST /api/open-cash-session - abre caja solo si no hay ninguna ya abierta,
// evaluado con el valor MÁS RECIENTE de la base (no el cache local del
// cliente, que puede tener hasta 5s de desactualización).
app.post('/api/open-cash-session', requireAuth, async (req, res) => {
  try {
    const result = await withKeyLock('cashSessions', async () => {
      const sessions = (await getStoreValue('cashSessions')) || [];
      const open = sessions.find(s => !s.closedAt);
      if (open) return { conflict: true, session: open };

      const newSession = {
        initialAmount: Number(req.body?.initialAmount) || 0,
        totalSales: 0, totalCash: 0, totalCard: 0, totalTransfer: 0,
        id: `cs-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        openedAt: new Date().toISOString(),
        userId: req.session.userId,
        userName: req.session.name
      };
      sessions.push(newSession);
      await setStoreValue('cashSessions', sessions);
      return { conflict: false, session: newSession };
    });

    if (result.conflict) {
      return res.status(409).json({ error: 'Ya hay una caja abierta', session: result.session });
    }
    res.json({ success: true, session: result.session });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// POST /api/sync-item - upsert o elimina UN item dentro de un array por su
// `id`, sin pisar cambios concurrentes a OTROS items del mismo array (a
// diferencia de /api/sync, que sobreescribe el array completo y por eso
// puede perder ediciones de otro dispositivo hechas en la misma ventana de
// poll). Genérico: sirve para cualquier key cuyo valor sea un array de
// objetos con `id` — hoy lo usan `orders` e `inventory`.
app.post('/api/sync-item', requireAuth, async (req, res) => {
  const { key, item, op } = req.body;
  if (!key || !item || !item.id) return res.status(400).json({ error: 'Faltan key/item/item.id' });
  if (op !== 'upsert' && op !== 'delete') return res.status(400).json({ error: 'op debe ser "upsert" o "delete"' });

  try {
    const count = await withKeyLock(key, async () => {
      const arr = (await getStoreValue(key)) || [];
      const idx = arr.findIndex(i => i.id === item.id);
      if (op === 'delete') {
        if (idx > -1) arr.splice(idx, 1);
      } else if (idx > -1) {
        arr[idx] = item;
      } else {
        arr.push(item);
      }
      await setStoreValue(key, arr);
      return arr.length;
    });
    res.json({ success: true, count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

/* ═══════════════════════════════════════════════════════════
   Store protegido — requiere sesión válida
   ═══════════════════════════════════════════════════════════ */

// GET /api/state - Devuelve toda la base de datos para la carga inicial (post-login)
app.get('/api/state', requireAuth, (req, res) => {
  db.all('SELECT key, value FROM store', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error de base de datos' });
    }
    const state = {};
    rows.forEach(row => {
      try {
        state[row.key] = JSON.parse(row.value);
      } catch (e) {
        state[row.key] = row.value; // En caso de ser un string simple
      }
    });
    // Los PINs nunca salen del servidor, ni siquiera hacia un cliente autenticado.
    if (Array.isArray(state.users)) {
      state.users = state.users.map(({ pin, ...rest }) => rest);
    }
    res.json(state);
  });
});

// POST /api/sync - Actualiza o inserta un dato específico (orders, products, etc)
app.post('/api/sync', requireAuth, async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Llave o valor faltante' });
  }

  try {
    let finalValue = value;
    // El cliente nunca tiene los PINs reales (se ocultan en /api/state), así que si
    // guarda el arreglo de usuarios sin `pin`, preservamos el PIN ya almacenado en
    // vez de dejarlo en blanco.
    if (key === 'users' && Array.isArray(value)) {
      const existing = (await getStoreValue('users')) || [];
      finalValue = value.map(u => {
        if (!u.pin) {
          const prev = existing.find(e => e.id === u.id);
          if (prev?.pin) return { ...u, pin: prev.pin };
        }
        return u;
      });
    }
    await setStoreValue(key, finalValue);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// POST /api/reset-sales - Limpia únicamente los datos de ventas (solo admin)
app.post('/api/reset-sales', requireAuth, requireAdmin, (req, res) => {
  db.run(`DELETE FROM store WHERE key IN ('orders', 'cashSessions', 'orderCounter', 'ps_cash_movements')`, [], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error de base de datos' });
    }
    res.json({ success: true });
  });
});

// POST /api/reset - Limpia toda la base de datos (solo admin)
app.post('/api/reset', requireAuth, requireAdmin, (req, res) => {
  db.run('DELETE FROM store', [], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error de base de datos' });
    }
    res.json({ success: true });
  });
});

/* ═══════════════════════════════════════════════════════════
   Archivado de pedidos viejos — `orders` se retransmite completo en cada
   poll de 5s de cada tablet y en cada escritura de otras keys que aún usan
   el modelo whole-array; sin límite, crece para siempre. Los pedidos con
   más de ARCHIVE_AFTER_DAYS se mueven (no se borran) a `archived_orders`,
   una tabla aparte que no viaja en /api/state.

   180 días es deliberadamente conservador: el Dashboard nunca consulta más
   de 30 días hacia atrás, así que archivar a los 180 no le quita nada.
   Por ahora no hay UI para ver pedidos archivados — si algún día hace
   falta, están en `archived_orders` con el pedido completo en `data`.
   ═══════════════════════════════════════════════════════════ */
const ARCHIVE_AFTER_DAYS = 180;

const archiveOldOrders = () => withKeyLock('orders', async () => {
  try {
    const orders = (await getStoreValue('orders')) || [];
    const cutoff = Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const keep = [];
    const toArchive = [];
    orders.forEach(o => {
      const t = new Date(o.createdAt).getTime();
      (!isNaN(t) && t < cutoff ? toArchive : keep).push(o);
    });
    if (toArchive.length === 0) return;

    const now = new Date().toISOString();
    await new Promise((resolve, reject) => {
      const stmt = db.prepare('INSERT OR REPLACE INTO archived_orders (id, data, archived_at) VALUES (?, ?, ?)');
      toArchive.forEach(o => stmt.run(o.id, JSON.stringify(o), now));
      stmt.finalize(err => err ? reject(err) : resolve());
    });
    await setStoreValue('orders', keep);
    console.log(`🗄️  Archivados ${toArchive.length} pedidos de más de ${ARCHIVE_AFTER_DAYS} días`);
  } catch (e) {
    console.error('Archivado de pedidos falló:', e.message);
  }
});

const ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(archiveOldOrders, ARCHIVE_INTERVAL_MS);
archiveOldOrders();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n======================================`);
  console.log(`🍕 PizzaSport POS + SQLite Backend`);
  console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
  console.log(`======================================\n`);
});
