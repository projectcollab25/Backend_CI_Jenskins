import express from 'express';
import { pool } from '../config/db.js';
import { requireAdmin } from '../middleware/auth.js';
import { handleDbError } from '../utils/dbError.js';

const router = express.Router();

// GET /products - list all products (backed by `rooms` table)
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { date } = req.query; // optional YYYY-MM-DD
  try {
    if (date) {
      // return products (rooms table) that have no bookings overlapping the given day
      const start = `${date}T00:00:00Z`;
      const end = `${date}T23:59:59Z`;
      const q = `
        SELECT r.* FROM rooms r
        WHERE NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.room_id = r.id
            AND tstzrange(b.start_time, b.end_time) && tstzrange($1::timestamptz, $2::timestamptz)
        )
        ORDER BY r.id
      `;
      const { rows } = await pool.query(q, [start, end]);
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT * FROM rooms ORDER BY id');
    return res.json(rows);
  } catch (err) {
    return handleDbError(res, err, 'Failed to fetch products');
  }
});

// GET /products/:id - get product by id
router.get('/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    return res.json(rows[0]);
  } catch (err) {
    return handleDbError(res, err, 'Failed to fetch product');
  }
});

// POST /products - create product (creates a row in `rooms` table)
router.post('/', requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { name, capacity = 1, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO rooms (name, capacity, description) VALUES ($1, $2, $3) RETURNING *',
      [name, capacity, description]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return handleDbError(res, err, 'Failed to create product');
  }
});

// PUT /products/:id - update product
router.put('/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { id } = req.params;
  const { name, capacity, description } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE rooms SET name = COALESCE($1, name), capacity = COALESCE($2, capacity), description = COALESCE($3, description) WHERE id = $4 RETURNING *',
      [name, capacity, description, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    return res.json(rows[0]);
  } catch (err) {
    return handleDbError(res, err, 'Failed to update product');
  }
});

// DELETE /products/:id - delete product
router.delete('/:id', requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM rooms WHERE id = $1', [id]);
    return res.status(204).end();
  } catch (err) {
    return handleDbError(res, err, 'Failed to delete product');
  }
});

export default router;
