// =============================================
// Qayed Backend - Database Configuration
// sql.js (pure JS SQLite, no native deps)
// =============================================
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'qayed.db');

let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;

  SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  console.log('📦 Connected to SQLite database');
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Auto-save every 10 seconds
setInterval(saveDb, 10000);

// Wrapper: run a query that modifies data (INSERT/UPDATE/DELETE)
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// Wrapper: get single row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Wrapper: get all rows
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

async function initializeDatabase() {
  const database = await getDb();

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      bio TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      latitude REAL DEFAULT 0,
      longitude REAL DEFAULT 0,
      city TEXT DEFAULT '',
      is_verified INTEGER DEFAULT 0,
      trust_score REAL DEFAULT 5.0,
      total_trades INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      condition TEXT DEFAULT 'used',
      estimated_value REAL DEFAULT 0,
      image_urls TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      latitude REAL DEFAULT 0,
      longitude REAL DEFAULT 0,
      city TEXT DEFAULT '',
      ai_analysis TEXT DEFAULT '{}',
      views_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS trade_requests (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      requestee_id TEXT NOT NULL,
      offered_item_id TEXT NOT NULL,
      wanted_item_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      responded_at TEXT,
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (requestee_id) REFERENCES users(id),
      FOREIGN KEY (offered_item_id) REFERENCES items(id),
      FOREIGN KEY (wanted_item_id) REFERENCES items(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      item_a_id TEXT NOT NULL,
      item_b_id TEXT NOT NULL,
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      user_a_code TEXT,
      user_b_code TEXT,
      verified_a INTEGER DEFAULT 0,
      verified_b INTEGER DEFAULT 0,
      latitude REAL,
      longitude REAL,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES trade_requests(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      trade_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewee_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (trade_id) REFERENCES trades(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      trade_request_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (trade_request_id) REFERENCES trade_requests(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      type TEXT DEFAULT 'general',
      reference_id TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(user_id, item_id)
    )
  `);

  saveDb();
  console.log('✅ Database tables initialized');
}

module.exports = { getDb, initializeDatabase, run, get, all, saveDb };
