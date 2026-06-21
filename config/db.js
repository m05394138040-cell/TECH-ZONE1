/**
 * PostgreSQL Database Connection
 * Uses a connection pool for performance.
 * Connection string comes from DATABASE_URL environment variable.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PG client', err);
});

/**
 * Helper: run a query with parameters
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('SQL', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Query error:', err.message, '\nSQL:', text);
    throw err;
  }
}

/**
 * Helper: get a single row
 */
async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

/**
 * Helper: get all rows
 */
async function queryAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

/**
 * Test the database connection
 */
async function testConnection() {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

module.exports = { pool, query, queryOne, queryAll, testConnection };