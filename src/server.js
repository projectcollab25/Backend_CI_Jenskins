import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());

// Root health / hello route
app.get('/', (req, res) => {
  res.send('Hello, world! 👋 Express is running');
});

// Health endpoint: checks basic app + DB connectivity and reports image version.
app.get('/health', async (req, res) => {
  const info = {
    status: 'ok',
    db: 'unknown',
    backend_image: process.env.IMAGE_VERSION || 'unknown',
    frontend_image: process.env.FRONTEND_IMAGE_VERSION || 'unknown',
  }
  try {
    // Try a cheap DB check if possible
    // import the pool lazily so the module load order is safe
    const { pool } = await import('./config/db.js')
    if (pool) {
      try {
        await pool.query('SELECT 1')
        info.db = 'ok'
      } catch (e) {
        info.db = 'down'
      }
    } else {
      info.db = 'unconfigured'
    }
  } catch (err) {
    info.db = 'error'
  }
  res.json(info)
})

// Dynamically load route modules from src/routes
// Each route file should default-export an Express Router.
async function loadRoutes() {
  const routesDir = path.join(__dirname, 'routes');
  if (!fs.existsSync(routesDir)) return;

  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const filepath = path.join(routesDir, file);
    try {
      const module = await import(filepath);
      const router = module.default;
      if (!router) continue;

      // Determine mount path from filename (simple heuristics)
      let mountPath = '/' + file.replace(/Routes?\.js$/i, '').replace(/s$/i, '').toLowerCase();
      // Specific shortcuts
      // Expose rooms routes under the new products path (API surface change)
      // NOTE: route handlers still operate on the underlying `rooms` table.
      if (/rooms?/i.test(file)) mountPath = '/products';
      if (/book/i.test(file)) mountPath = '/book';
      if (/auth/i.test(file)) mountPath = '/auth';

      app.use(mountPath, router);
      console.log(`Loaded route ${file} -> ${mountPath}`);
    } catch (err) {
      console.warn(`Failed loading route file ${file}:`, err && err.message ? err.message : err);
    }
  }
}

// Start application
async function start() {
  // Optionally connect to a database or other services
  try {
    await connectDB();
  } catch (err) {
    console.warn('Database connect failed (continuing):', err && err.message ? err.message : err);
  }

  await loadRoutes();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start();
