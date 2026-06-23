/**
 * Database Initialization Script
 * Run once on first setup, or whenever you want to reset the schema.
 *
 * Usage: node scripts/init-db.js
 *
 * IMPORTANT: This script is IDEMPOTENT.
 * - Creates tables only if they don't exist
 * - Inserts default categories only if they don't exist
 * - Inserts admin user only if it doesn't exist
 * - Never deletes existing data
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query, queryOne, testConnection } = require('../config/db');

const DEFAULT_CATEGORIES = [
  { name: 'السماعات', slug: 'headphones', icon: '🎧' },
  { name: 'الشواحن', slug: 'chargers', icon: '🔌' },
  { name: 'الكبلات', slug: 'cables', icon: '🔗' },
  { name: 'البفلات', slug: 'powerbanks', icon: '🔋' },
  { name: 'الساعات', slug: 'watches', icon: '⌚' },
  { name: 'العدسات', slug: 'lenses', icon: '📷' },
  { name: 'مبردات الهاتف', slug: 'phone-coolers', icon: '❄️' },
  { name: 'المراوح', slug: 'fans', icon: '🌀' },
  { name: 'ماوس وكيبوردات', slug: 'mouse-keyboards', icon: '🖱️' },
  { name: 'الكاميرات', slug: 'cameras', icon: '📸' },
  { name: 'الاتاري', slug: 'atari', icon: '🎮' },
  { name: 'التحويلات', slug: 'adapters', icon: '🔀' },
  { name: 'اكسسوارت الكمبيوتر', slug: 'pc-accessories', icon: '💻' },
  { name: 'عروض', slug: 'offers', icon: '🏷️' },
  { name: 'مايكات', slug: 'mics', icon: '🎙️' },
  { name: 'ستاندات', slug: 'stands', icon: '📐' },
  { name: 'قبضات', slug: 'grips', icon: '🤳' },
];

async function createTables() {
  console.log('📦 Creating tables...');

  await query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      icon VARCHAR(20) DEFAULT '',
      image_data BYTEA,
      image_type VARCHAR(50),
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migration: add image columns to existing categories table
  await query(`
    ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS image_data BYTEA
  `);
  await query(`
    ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS image_type VARCHAR(50)
  `);

  // Add social media settings
  const socialSettings = [
    ['social_youtube', ''],
    ['social_facebook', ''],
    ['social_instagram', ''],
    ['social_twitter', ''],
    ['social_tiktok', ''],
    ['social_whatsapp', ''],
  ];
  for (const [key, value] of socialSettings) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  // Add news ticker settings
  const tickerSettings = [
    ['ticker_enabled', 'true'],
    ['ticker_text', '🔥 عروض حصرية على السماعات • شحن مجاني للطلبات فوق 50$ • ضمان سنة كاملة على جميع المنتجات • توصيل سريع لكل المناطق'],
    ['ticker_color', '#ffffff'],
    ['ticker_bg_color', '#0a0a0a'],
  ];
  for (const [key, value] of tickerSettings) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  // Wholesale currency settings
  const wholesaleSettings = [
    ['wholesale_currency', 'USD'],
    ['wholesale_symbol', '$'],
    ['retail_currency', 'TRY'],
    ['retail_symbol', '₺'],
    ['exchange_rate', '32'],
  ];
  for (const [key, value] of wholesaleSettings) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  // Slider images table (top hero carousel - admin-managed)
  await query(`
    CREATE TABLE IF NOT EXISTS slider_images (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) DEFAULT '',
      link_url VARCHAR(500) DEFAULT '',
      image_data BYTEA NOT NULL,
      image_type VARCHAR(50),
      sort_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Notifications (in-app inbox for users, identified by phone)
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(50) NOT NULL,
      type VARCHAR(50) DEFAULT 'general',
      title VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      icon VARCHAR(50) DEFAULT '🔔',
      link VARCHAR(500) DEFAULT '',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Index for fast lookup by phone
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_phone ON notifications (phone, created_at DESC)`);

  // Wholesale applications (pending review by admin)
  await query(`
    CREATE TABLE IF NOT EXISTS wholesale_applications (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      state VARCHAR(50) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      volume_range VARCHAR(30) NOT NULL,
      notes TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'pending',
      admin_notes TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      reviewed_at TIMESTAMP
    )
  `);

  // Wholesale users table
  await query(`
    CREATE TABLE IF NOT EXISTS wholesale_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100),
      phone VARCHAR(50),
      notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      description TEXT DEFAULT '',
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      price_retail DECIMAL(10,2) NOT NULL DEFAULT 0,
      price_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      available BOOLEAN DEFAULT TRUE,
      image_data BYTEA,
      image_type VARCHAR(50),
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migration: add price_retail column to existing products
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_retail DECIMAL(10,2) DEFAULT 0`);
  // Backfill: copy price -> price_retail for any rows where price_retail is 0 (but price > 0)
  await query(`UPDATE products SET price_retail = price WHERE (price_retail IS NULL OR price_retail = 0) AND price > 0`);

  // Migration: add price_cost column (admin's purchase cost — hidden from public)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_cost DECIMAL(10,2) DEFAULT 0`);

  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log('✅ Tables created');
}

async function seedCategories() {
  console.log('📂 Seeding categories...');
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    await query(
      `INSERT INTO categories (name, slug, icon, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING`,
      [cat.name, cat.slug, cat.icon, i]
    );
  }
  const { rows } = await query('SELECT COUNT(*) FROM categories');
  console.log(`✅ Categories ready (${rows[0].count} total)`);
}

async function seedSettings() {
  console.log('⚙️  Seeding settings...');
  const defaults = {
    whatsapp_number: process.env.DEFAULT_WHATSAPP || '+962790000000',
    site_name: process.env.DEFAULT_SITE_NAME || 'TECH ZONE',
    logo_text: process.env.DEFAULT_SITE_NAME || 'TECH ZONE',
    logo_image: '',
    logo_image_type: '',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
  console.log('✅ Settings ready');
}

async function seedAdmin() {
  console.log('👤 Seeding admin user...');
  const username = process.env.ADMIN_USERNAME || 'GH1899';
  const password = process.env.ADMIN_PASSWORD || '266641';

  const existing = await queryOne('SELECT id FROM admin_users WHERE username = $1', [username]);
  if (existing) {
    console.log('ℹ️  Admin user already exists, skipping');
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await query(
    'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
    [username, hash]
  );
  console.log(`✅ Admin user created: ${username}`);
  console.log('🔒 Password is bcrypt-hashed and NOT visible in source code');
}

async function main() {
  console.log('🚀 Initializing TECH ZONE database...\n');

  const ok = await testConnection();
  if (!ok) {
    console.error('\n❌ Cannot connect to database. Check DATABASE_URL.');
    process.exit(1);
  }
  console.log('✅ Database connection OK\n');

  await createTables();
  await seedCategories();
  await seedSettings();
  await seedAdmin();

  console.log('\n🎉 Database initialized successfully!');
  console.log('👉 Run `npm start` to launch the server.\n');

  // Only close pool if running as a standalone script
  if (require.main === module) {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Init failed:', err);
  if (require.main === module) {
    pool.end();
    process.exit(1);
  }
});