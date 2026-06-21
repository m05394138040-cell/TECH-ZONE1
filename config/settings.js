/**
 * Settings helper
 * Settings are stored in the DB as key/value pairs.
 * Cache them in memory for a short time to reduce DB load.
 */

const { queryAll, queryOne, query } = require('./db');

const CACHE_TTL_MS = 30 * 1000; // 30s cache
let cache = null;
let cacheAt = 0;

async function getAllSettings() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  const rows = await queryAll('SELECT key, value FROM settings');
  cache = {};
  for (const row of rows) cache[row.key] = row.value;
  cacheAt = now;
  return cache;
}

async function getSetting(key, defaultValue = '') {
  const settings = await getAllSettings();
  return settings[key] ?? defaultValue;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
  cache = null; // invalidate
}

function clearCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getAllSettings, getSetting, setSetting, clearCache };