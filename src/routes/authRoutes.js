import express from 'express';
import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

const router = express.Router();

// POST /auth/register - create a new user
router.post('/register', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { email, name, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, name, hashed_password, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email, name || null, hash, role || 'user']
    );
    const user = rows[0]
    // sign token
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' })
    res.status(201).json({ user, token });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST /auth/login - authenticate user
router.post('/login', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const { rows } = await pool.query('SELECT id, email, name, role, hashed_password FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.hashed_password || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    // sign JWT token and return with user info
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' })
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
