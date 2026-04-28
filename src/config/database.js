// =============================================
// Qayed Backend - PostgreSQL Database Layer
// Using pg (node-postgres) with connection pool
// =============================================
const { Pool } = require('pg');

// ── Connection Pool ──────────────────────────
// On Render: DATABASE_URL is set automatically
// Locally: set DATABASE_URL in .env

if (!process.env.DATABASE_URL) {
  console.error('⚠️  DATABASE_URL is NOT set! Using fallback localhost.');
  console.error('   Set DATABASE_URL in Render Environment Variables.');
}

console.log('🔗 DB Target:', process.env.DATABASE_URL 
  ? process.env.DATABASE_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
  : 'NOT SET (will use localhost:5432)');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }   // Required for Render managed Postgres
    : false,
  max: 10,                            // max pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

// ── Query Wrappers ───────────────────────────

// Run a query that modifies data (INSERT / UPDATE / DELETE)
// Returns the result object from pg
async function run(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// Get a single row — returns null if not found
async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

// Get all matching rows — returns []
async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// ── Schema Initialization ────────────────────
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone       TEXT UNIQUE,
        name        TEXT NOT NULL,
        email       TEXT UNIQUE,
        avatar_url  TEXT,
        bio         TEXT DEFAULT '',
        password_hash TEXT NOT NULL,
        latitude    DECIMAL(10,6) DEFAULT 0,
        longitude   DECIMAL(10,6) DEFAULT 0,
        city        TEXT DEFAULT '',
        is_verified INTEGER DEFAULT 0,
        trust_score DECIMAL(3,2) DEFAULT 5.0,
        total_trades INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone       TEXT NOT NULL,
        code        TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        is_used     INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title            TEXT NOT NULL,
        description      TEXT DEFAULT '',
        category         TEXT DEFAULT 'other',
        condition        TEXT DEFAULT 'used',
        estimated_value  DECIMAL(12,2) DEFAULT 0,
        image_urls       TEXT[] DEFAULT '{}',
        status           TEXT DEFAULT 'active',
        latitude         DECIMAL(10,6) DEFAULT 0,
        longitude        DECIMAL(10,6) DEFAULT 0,
        city             TEXT DEFAULT '',
        ai_analysis      JSONB DEFAULT '{}',
        views_count      INTEGER DEFAULT 0,
        wants            TEXT DEFAULT '',
        created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trade_requests (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id    UUID NOT NULL REFERENCES users(id),
        requestee_id    UUID NOT NULL REFERENCES users(id),
        offered_item_id UUID NOT NULL REFERENCES items(id),
        wanted_item_id  UUID NOT NULL REFERENCES items(id),
        status          TEXT DEFAULT 'pending',
        message         TEXT DEFAULT '',
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        responded_at    TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id   UUID NOT NULL REFERENCES trade_requests(id),
        item_a_id    UUID NOT NULL REFERENCES items(id),
        item_b_id    UUID NOT NULL REFERENCES items(id),
        user_a_id    UUID NOT NULL REFERENCES users(id),
        user_b_id    UUID NOT NULL REFERENCES users(id),
        status       TEXT DEFAULT 'active',
        user_a_code  TEXT,
        user_b_code  TEXT,
        verified_a   INTEGER DEFAULT 0,
        verified_b   INTEGER DEFAULT 0,
        latitude     DECIMAL(10,6),
        longitude    DECIMAL(10,6),
        completed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trade_id    UUID NOT NULL REFERENCES trades(id),
        reviewer_id UUID NOT NULL REFERENCES users(id),
        reviewee_id UUID NOT NULL REFERENCES users(id),
        rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT DEFAULT '',
        created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trade_request_id UUID NOT NULL REFERENCES trade_requests(id),
        sender_id        UUID NOT NULL REFERENCES users(id),
        content          TEXT NOT NULL,
        type             TEXT DEFAULT 'text',
        is_read          INTEGER DEFAULT 0,
        created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        body         TEXT DEFAULT '',
        type         TEXT DEFAULT 'general',
        reference_id UUID,
        is_read      INTEGER DEFAULT 0,
        created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT UNIQUE NOT NULL,
        label       TEXT NOT NULL,
        icon        TEXT DEFAULT 'apps-outline',
        color       TEXT DEFAULT '#6366F1',
        is_active   INTEGER DEFAULT 1,
        created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Default Categories (Expanded for high use) ───────────────────
    const catCount = await client.query('SELECT COUNT(*) as c FROM categories');
    if (true) { // Always sync categories to fix icons/labels
      const defaultCats = [
        ['phones',      'جوالات',       'phone-portrait-outline', '#00BFA6'],
        ['electronics', 'إلكترونيات',   'laptop-outline',         '#3B82F6'],
        ['appliances',  'أجهزة منزلية', 'tv-outline',             '#F59E0B'],
        ['fashion',     'أزياء وملابس', 'shirt-outline',          '#6366F1'],
        ['furniture',   'أثاث وديكور',  'home-outline',           '#10B981'],
        ['cars',        'سيارات',       'car-sport-outline',      '#EF4444'],
        ['games',       'ألعاب',        'game-controller-outline', '#8B5CF6'],
        ['watches',     'ساعات',        'watch-outline',          '#EC4899'],
        ['books',       'كتب وتعليم',   'book-outline',           '#6B7280'],
        ['sports',      'رياضة ولياقة', 'fitness-outline',        '#22C55E'],
        ['cameras',     'كاميرات',      'camera-outline',         '#F97316'],
        ['beauty',      'عطور وتجميل',  'color-filter-outline',   '#D946EF'],
        ['other',       'أخرى',         'apps-outline',           '#94A3B8'],
      ];
      for (const [name, label, icon, color] of defaultCats) {
        await client.query(
          'INSERT INTO categories (name, label, icon, color) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, color = EXCLUDED.color',
          [name, label, icon, color]
        );
      }
      console.log('📦 Major categories synchronized');
    }

    // ── Indexes for performance ──────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_user_id    ON items(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_status      ON items(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_category    ON items(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_city        ON items(city)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trades_users      ON trades(user_a_id, user_b_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_trade    ON messages(trade_request_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifs_user       ON notifications(user_id, is_read)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_otp_phone         ON otp_codes(phone)`);

    console.log('✅ PostgreSQL tables and indexes initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initializeDatabase, run, get, all };
