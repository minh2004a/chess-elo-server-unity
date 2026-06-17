const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Neon and Render Postgres both require SSL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] schema ready');
}

module.exports = { pool, initSchema };
