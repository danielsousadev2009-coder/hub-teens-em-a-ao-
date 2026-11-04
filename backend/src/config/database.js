import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

let poolConfig;

if (config.database.url) {
  poolConfig = {
    connectionString: config.database.url,
  };
} else {
  poolConfig = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  };
}

// Configure SSL for PostgreSQL / Supabase
if (config.database.sslMode !== 'disable' && config.database.host !== '127.0.0.1' && config.database.host !== 'localhost') {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

// Transaction pooler optimizations
if (config.database.isTransactionPooler || process.env.VERCEL === '1') {
  poolConfig.max = 10;
  poolConfig.idleTimeoutMillis = 10000;
  poolConfig.connectionTimeoutMillis = 5000;
}

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (!config.isProd && duration > 500) {
    console.warn(`Slow query (${duration}ms):`, text);
  }
  return res;
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function checkConnection() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}

