// TaskHub - Tier 1 (application tier).
// Ye ek hi process hai jo: (1) web page serve karta hai, (2) API deta hai,
// (3) database (Tier 2, PostgreSQL) se baat karta hai.
//
// Roles:
//   user  -> sirf apne tasks dekh/bana/badal sakta hai
//   admin -> sab ke tasks dekh sakta hai, users manage kar sakta hai

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

// DB ki settings code mein nahi, environment variables se aati hain.
// Isse same image local, Docker aur Kubernetes, teeno jagah chalti hai.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'taskhub',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'taskhub',
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

// Authentication: "aap kaun ho?" - token check karta hai
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET); // { id, username, role }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Authorization: "aap ko ijazat hai?" - role check karta hai
const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Forbidden: ' + role + ' only' });

// ---------- health endpoints (Kubernetes probes ke liye) ----------
// /health: process zinda hai? (DB check nahi karta)
app.get('/health', (req, res) => res.json({ status: 'ok' }));
// /ready: kya traffic lene ke liye tayyar hai? (DB check karta hai)
app.get('/ready', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ready' });
}));

// ---------- auth routes ----------
app.post('/api/register', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || username.length < 3 || username.length > 30)
    return res.status(400).json({ error: 'Username must be 3-30 characters' });
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const hash = await bcrypt.hash(password, 10); // password kabhi plain text store nahi hota
  try {
    // Register karne wala hamesha 'user' banta hai, admin nahi
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
      [username, hash, 'user']);
    res.status(201).json({ message: 'Registered' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    throw e;
  }
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
    return res.status(401).json({ error: 'Wrong username or password' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role },
    JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, username: user.username, role: user.role });
}));

// ---------- task routes ----------
app.get('/api/tasks', auth, wrap(async (req, res) => {
  const q = req.user.role === 'admin'
    ? 'SELECT t.id,t.title,t.done,u.username AS owner FROM tasks t JOIN users u ON u.id=t.owner_id ORDER BY t.id DESC'
    : 'SELECT t.id,t.title,t.done,u.username AS owner FROM tasks t JOIN users u ON u.id=t.owner_id WHERE t.owner_id=$1 ORDER BY t.id DESC';
  const { rows } = await pool.query(q, req.user.role === 'admin' ? [] : [req.user.id]);
  res.json(rows);
}));

app.post('/api/tasks', auth, wrap(async (req, res) => {
  const title = ((req.body || {}).title || '').trim();
  if (!title || title.length > 200) return res.status(400).json({ error: 'Title required (max 200 chars)' });
  const { rows } = await pool.query(
    'INSERT INTO tasks (title, owner_id) VALUES ($1,$2) RETURNING id,title,done', [title, req.user.id]);
  res.status(201).json(rows[0]);
}));

// Owner ya admin hi task badal/hata sakta hai
async function canTouchTask(user, taskId) {
  const { rows } = await pool.query('SELECT owner_id FROM tasks WHERE id=$1', [taskId]);
  if (!rows[0]) return 'missing';
  return (user.role === 'admin' || rows[0].owner_id === user.id) ? 'ok' : 'forbidden';
}

app.patch('/api/tasks/:id/toggle', auth, wrap(async (req, res) => {
  const check = await canTouchTask(req.user, req.params.id);
  if (check === 'missing') return res.status(404).json({ error: 'Task not found' });
  if (check === 'forbidden') return res.status(403).json({ error: 'Not your task' });
  await pool.query('UPDATE tasks SET done = NOT done WHERE id=$1', [req.params.id]);
  res.json({ message: 'Updated' });
}));

app.delete('/api/tasks/:id', auth, wrap(async (req, res) => {
  const check = await canTouchTask(req.user, req.params.id);
  if (check === 'missing') return res.status(404).json({ error: 'Task not found' });
  if (check === 'forbidden') return res.status(403).json({ error: 'Not your task' });
  await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// ---------- admin-only routes ----------
app.get('/api/users', auth, requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role FROM users ORDER BY id');
  res.json(rows);
}));

app.patch('/api/users/:id/role', auth, requireRole('admin'), wrap(async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
  await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
  res.json({ message: 'Role updated' });
}));

app.delete('/api/users/:id', auth, requireRole('admin'), wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ message: 'User deleted' });
}));

// ---------- startup: DB tayyar hone ka intezar, tables banao, admin seed karo ----------
async function initDb(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user'))
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      const exists = await pool.query("SELECT 1 FROM users WHERE username='admin'");
      if (!exists.rowCount && process.env.ADMIN_PASSWORD) {
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        await pool.query("INSERT INTO users (username,password_hash,role) VALUES ('admin',$1,'admin')", [hash]);
        console.log('Admin user created');
      }
      console.log('Database ready');
      return;
    } catch (e) {
      console.log(`Waiting for database (${i}/${retries}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database unreachable');
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`TaskHub running on port ${PORT}`)))
  .catch((e) => { console.error(e); process.exit(1); });
