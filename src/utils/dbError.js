export function handleDbError(res, err, fallbackMessage = 'Internal server error') {
  try {
    console.error(err);
  } catch (e) {
    // ignore
  }
  const msg = err && err.message ? String(err.message).toLowerCase() : '';
  const connIssues = ['password authentication failed', 'authentication failed', 'self-signed', 'certificate', 'connection refused', 'could not connect', 'timeout'];
  for (const p of connIssues) {
    if (msg.includes(p)) {
      return res.status(503).json({ error: 'Database connection error' });
    }
  }
  return res.status(500).json({ error: fallbackMessage });
}
