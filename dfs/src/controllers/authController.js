import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/db.js';
import { generateToken } from '../middleware/auth.js';

export async function register(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const id = uuidv4();

  db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)').run(id, username, hashed);

  const token = generateToken({ id, username });
  res.status(201).json({ token, user: { id, username } });
}

export async function login(req, res) {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
}

export function me(req, res) {
  const user = db.prepare('SELECT id, username, quota_bytes, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const usage = db.prepare(`
    SELECT COALESCE(SUM(size_bytes), 0) AS total
    FROM files WHERE owner_id = ? AND deleted_at IS NULL
  `).get(req.user.id);

  res.json({ ...user, used_bytes: usage.total });
}
