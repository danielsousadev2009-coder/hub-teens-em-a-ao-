import { query } from '../config/database.js';

const cache = new Map();
let initialized = false;

export async function ensureSettingsTable() {
  if (initialized) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    initialized = true;
  } catch (err) {
    // If DB fails temporarily, proceed with in-memory cache
    console.error('Failed to verify system_settings table:', err.message);
  }
}

export async function getSetting(key, fallback = null) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  await ensureSettingsTable();

  try {
    const res = await query('SELECT value FROM system_settings WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      const val = res.rows[0].value;
      cache.set(key, val);
      return val;
    }
  } catch (err) {
    console.error(`Error reading setting ${key}:`, err.message);
  }

  return fallback;
}

export async function setSetting(key, value) {
  cache.set(key, value);
  await ensureSettingsTable();

  try {
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, String(value)]
    );
    return true;
  } catch (err) {
    console.error(`Error saving setting ${key}:`, err.message);
    return false;
  }
}

export function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}
