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
      if (/rooms?/i.test(file)) mountPath = '/rooms';
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
