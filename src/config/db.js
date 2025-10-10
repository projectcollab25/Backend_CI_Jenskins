// Postgres connection using node-postgres Pool
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

let pool;

if (!connectionString) {
  console.warn('No DATABASE_URL provided; DB pool will not be created.');
} else {
  pool = new Pool({
    connectionString,
    ssl: {
      // Supabase requires SSL; set to false if you want stricter validation and provide CA
      rejectUnauthorized: false,
    },
  });

  pool.on('error', (err) => {
    // Log the error but do not exit the whole process.
    // Some managed Postgres providers (and poolers) emit shutdown/terminate events
    // which surface here; exiting the process makes the server brittle in development
    // and can be problematic for transient network issues. Keep the process alive
    // and surface the error so the next requests can fail gracefully or retry.
    console.error('Unexpected PG client error (non-fatal):', err && err.message ? err.message : err, {
      fullError: err,
    });
  });

  console.log('Postgres pool created');
}

// Simple connect helper used by server startup
const connectDB = async () => {
  if (!pool) return;
  // verify connection
  const client = await pool.connect();
  client.release();
  console.log('Postgres connected');
};

export { pool };
export default connectDB;
