// Postgres connection using node-postgres Pool
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

let pool;
let recreating = false;
let recreateBackoff = 1000; // ms

function createPoolFromEnv() {
  const connectionString = process.env.DATABASE_URL;
  const dbHost = process.env.DATABASE_HOST;

  // Keep TLS bypass behaviour explicit (temporary for testing). Replace with mounted CA in prod.
  if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED || process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
    console.warn('Disabling Node TLS certificate verification for Postgres connections (NODE_TLS_REJECT_UNAUTHORIZED=0)');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  // Common pool options to reduce unexpected disconnects and improve resiliency
  const common = {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || '10000', 10),
    application_name: process.env.DB_APP_NAME || 'reservation-backend',
    // Node TCP keepAlive for sockets
    keepAlive: true,
  };

  if (dbHost) {
    const port = process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT, 10) : 5432;
    const p = new Pool({
      host: process.env.DATABASE_HOST,
      port,
      database: process.env.DATABASE_NAME || 'postgres',
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      ssl: {
        rejectUnauthorized: false,
      },
      ...common,
    });
    console.log('Postgres pool created (components)');
    return p;
  }

  // fallback to connection string
  const p = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    ...common,
  });
  console.log('Postgres pool created (connectionString)');
  return p;
}

function attachPoolHandlers(p) {
  if (!p) return;
  p.on('error', (err) => {
    // Avoid logging huge objects to console; print concise context and schedule reconnect.
    try {
      const code = err && err.code ? err.code : 'UNKNOWN';
      const severity = err && err.severity ? err.severity : 'UNKNOWN';
      console.error(`Unexpected PG client error (non-fatal) code=${code} severity=${severity} message=${err && err.message ? err.message : String(err)}`);
    } catch (e) {
      console.error('Unexpected PG client error (non-fatal) (failed to stringify)', e);
    }

    // schedule a pool recreation with backoff to recover from providers/pooleer-initiated shutdowns
    if (!recreating) {
      recreating = true;
      const backoff = recreateBackoff;
      console.warn(`Scheduling pool recreation in ${backoff}ms`);
      setTimeout(async () => {
        try {
          console.warn('Recreating Postgres pool (recovering from non-fatal error)...');
          // gracefully end old pool
          try {
            await p.end();
          } catch (e) {
            console.warn('Error while ending old pool', e && e.message ? e.message : e);
          }
          pool = createPoolFromEnv();
          attachPoolHandlers(pool);
          // increase backoff up to a ceiling
          recreateBackoff = Math.min(recreateBackoff * 2, 30000);
          console.warn('Postgres pool recreation complete');
        } catch (e) {
          console.error('Failed to recreate Postgres pool', e && e.message ? e.message : e);
        } finally {
          recreating = false;
        }
      }, backoff);
    }
  });
}

// instantiate pool on module load if possible
try {
  if (process.env.DATABASE_URL || process.env.DATABASE_HOST) {
    pool = createPoolFromEnv();
    attachPoolHandlers(pool);
  } else {
    console.warn('No DATABASE_URL or DATABASE_HOST provided; DB pool will not be created.');
  }
} catch (err) {
  console.error('Failed to create Postgres pool at startup:', err && err.message ? err.message : err);
}

// Simple connect helper used by server startup
const connectDB = async () => {
  if (!pool) return;
  // verify connection
  const client = await pool.connect();
  try {
    client.release();
    console.log('Postgres connected');
  } catch (e) {
    console.warn('Postgres connect helper: failed to release client', e && e.message ? e.message : e);
  }
};

export { pool };
export default connectDB;
