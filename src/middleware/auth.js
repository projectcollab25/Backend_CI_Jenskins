import jwt from 'jsonwebtoken'

// Use a secret from env or a fallback for development. In production this MUST be set.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

function getDevSessionUser(req) {
  try {
    if (req.headers['x-session-user']) return JSON.parse(req.headers['x-session-user'])
  } catch (e) {
    // ignore
  }
  return null
}

export function requireAuth(req, res, next) {
  // First try Authorization Bearer token
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7)
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      req.user = payload
      return next()
    } catch (e) {
      // invalid token -> fall through to dev header fallback
      // continue to check x-session-user for dev convenience
    }
  }

  // Fallback: dev-time x-session-user header (stringified JSON)
  const dev = getDevSessionUser(req)
  if (dev) { req.user = dev; return next() }

  return res.status(401).json({ error: 'Unauthorized' })
}

export function requireAdmin(req, res, next) {
  // If req.user not set, attempt to populate it from Authorization header or dev header.
  if (!req.user) {
    const auth = req.headers.authorization || ''
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7)
      try {
        const payload = jwt.verify(token, JWT_SECRET)
        req.user = payload
      } catch (e) {
        // invalid token -> try dev header fallback
      }
    }
    if (!req.user) {
      const dev = getDevSessionUser(req)
      if (dev) req.user = dev
    }
  }

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' })
  next()
}
