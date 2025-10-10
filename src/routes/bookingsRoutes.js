import express from 'express';
import { pool } from '../config/db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Lightweight request tracing helper to aid debugging in development
const debugLog = (req, label) => {
  try {
    const auth = req.headers.authorization || '';
    const hasAuth = !!auth;
    const sessionUser = req.user || (req.headers['x-session-user'] ? JSON.parse(req.headers['x-session-user']) : null);
    const userDesc = sessionUser ? `${sessionUser.id}/${sessionUser.role}` : 'none';
    // Use console.debug so these logs can be filtered separately from errors
    console.debug(`[bookingsRoutes] ${new Date().toISOString()} ${label} ${req.method} ${req.originalUrl} auth=${hasAuth} user=${userDesc}`);
  } catch (e) {
    console.debug('[bookingsRoutes] debugLog error', e && e.message ? e.message : e);
  }
}

// GET /book - list bookings (optionally filter by room_id)
router.get('/', requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  // Filters: user (name or email), date_from, date_to, status, room_id
  const { user, date_from, date_to, status, room_id } = req.query;
  try {
    let where = [];
    const params = [];
    let idx = 1;

    if (room_id) {
      where.push(`b.room_id = $${idx++}`); params.push(room_id);
    }
    if (status) {
      where.push(`b.status = $${idx++}`); params.push(status);
    }
    if (date_from) {
      where.push(`b.start_time >= $${idx++}`); params.push(`${date_from}T00:00:00Z`);
    }
    if (date_to) {
      where.push(`b.end_time <= $${idx++}`); params.push(`${date_to}T23:59:59Z`);
    }
    if (user) {
      where.push(`(u.email ILIKE $${idx} OR u.name ILIKE $${idx})`); params.push(`%${user}%`); idx++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const q = `SELECT b.*, r.name as room_name, u.email as user_email, u.name as user_name FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id LEFT JOIN users u ON b.user_id = u.id ${whereClause} ORDER BY b.start_time`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// PATCH /book/:id/status - update booking status (admin only)
router.patch('/:id/status', requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    const updateQ = `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`;
    const { rows } = await pool.query(updateQ, [status, id]);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    // return joined row with room and user info
    const fullQ = `SELECT b.*, r.name as room_name, u.email as user_email, u.name as user_name FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id LEFT JOIN users u ON b.user_id = u.id WHERE b.id = $1`;
    const full = await pool.query(fullQ, [id]);
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// GET /availability?room_id=&date=YYYY-MM-DD -> { available: boolean }
router.get('/availability', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { room_id, date } = req.query;
  if (!room_id || !date) return res.status(400).json({ error: 'room_id and date required' });
  try {
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59Z`;
    const q = `SELECT 1 FROM bookings WHERE room_id = $1 AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz) LIMIT 1`;
    const r = await pool.query(q, [room_id, start, end]);
    const available = r.rows.length === 0;
    res.json({ available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Availability check failed' });
  }
});

// GET /book/:id - get booking by id
// GET /book/my - bookings for current user
router.get('/my', requireAuth, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const user = req.user
  if (!user || !user.id) return res.status(401).json({ error: 'Unauthorized' })
  try {
    // Return joined rows including status and room info for frontend
    const q = `SELECT b.*, r.name as room_name, u.email as user_email, u.name as user_name FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id LEFT JOIN users u ON b.user_id = u.id WHERE b.user_id = $1 ORDER BY b.start_time`;
    const { rows } = await pool.query(q, [user.id]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching bookings for user', user && user.id, err);
    res.status(500).json({ error: 'Failed to fetch bookings' })
  }
});

// GET /book/:id - get booking by id
router.get('/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// POST /book - create a booking
router.post('/', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  let { room_id, user_id, start_time, end_time, date, notes } = req.body;
  if (!room_id) return res.status(400).json({ error: 'room_id required' });

  try {
    // If date provided, convert to start_time/end_time for that full day (single-day booking)
    if (date) {
      // Prevent bookings for past dates (require date >= today)
      const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD in UTC
      if (String(date) < today) {
        return res.status(400).json({ error: 'Cannot create booking for past dates' });
      }
      start_time = `${date}T00:00:00Z`;
      end_time = `${date}T23:59:59Z`;
    }
    if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time (or date) required' });

    const s = new Date(start_time).getTime();
    const e = new Date(end_time).getTime();
    if (isNaN(s) || isNaN(e) || s >= e) return res.status(400).json({ error: 'Invalid start_time/end_time' });

    // Enforce same calendar day and <= 24 hours
    const sameDay = new Date(start_time).toISOString().slice(0,10) === new Date(end_time).toISOString().slice(0,10);
    if (!sameDay || (e - s) > 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Reservation must be within one day' });

    // Optional dev-time user check: x-session-user header can carry JSON { id, role }
    const sessionUser = req.headers['x-session-user'] ? JSON.parse(req.headers['x-session-user']) : null;
    if (sessionUser && sessionUser.role === 'user') {
      // enforce user can only create booking for themselves
      if (user_id && Number(user_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Users may only create bookings for themselves' });
      }
      // if user_id not provided, set to session user id
      user_id = sessionUser.id;
    }

  // Check for overlapping bookings for the same room
    const overlapQ = `SELECT 1 FROM bookings WHERE room_id = $1 AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz) LIMIT 1`;
    const overlapRes = await pool.query(overlapQ, [room_id, start_time, end_time]);
    if (overlapRes.rows.length) {
      return res.status(409).json({ error: 'Room unavailable for selected date/time' });
    }

    const insertQ = `
      INSERT INTO bookings (room_id, user_id, start_time, end_time, status, notes)
      VALUES ($1, $2, $3::timestamptz, $4::timestamptz, 'pending', $5)
      RETURNING *
    `;
    const { rows } = await pool.query(insertQ, [room_id, user_id || null, start_time, end_time, notes]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// DELETE /book/:id - delete booking
router.delete('/:id', requireAuth, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DB not configured' });
  const { id } = req.params;
  try {
    // enforce ownership: only admin or owner can delete
    // Prefer JWT-authenticated user (req.user) populated by requireAuth
    const authUser = req.user || (req.headers['x-session-user'] ? JSON.parse(req.headers['x-session-user']) : null);
    const { rows } = await pool.query('SELECT user_id FROM bookings WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    const ownerId = rows[0].user_id;
    if (!(authUser && (authUser.role === 'admin' || Number(authUser.id) === Number(ownerId)))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// ...duplicate legacy '/my' handler removed; JWT-protected '/my' handler is defined earlier in this file.

export default router;
