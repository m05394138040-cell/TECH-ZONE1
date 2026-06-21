/**
 * TECH ZONE - Main Server
 *
 * Stack:
 *  - Express (web framework)
 *  - EJS (server-side templates)
 *  - PostgreSQL (persistent storage — survives Render restarts)
 *  - JWT cookies (admin auth)
 *  - Multer (image upload, in-memory; stored as BYTEA in DB)
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const { testConnection } = require('./config/db');
const { attachAdminToViews } = require('./middleware/auth');
const { getAllSettings } = require('./config/settings');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== View Engine =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== Middleware =====
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Attach admin status to all views
app.use(attachAdminToViews);

// Make settings available to all views
app.use(async (req, res, next) => {
  try {
    res.locals.settings = await getAllSettings();
    res.locals.siteName = res.locals.settings.site_name || 'TECH ZONE';
    res.locals.whatsappNumber = res.locals.settings.whatsapp_number || '';
    next();
  } catch (err) {
    next(err);
  }
});

// ===== Routes =====
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// ===== 404 =====
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).render('404', { title: 'الصفحة غير موجودة' });
  }
  res.status(404).json({ error: 'Not found' });
});

// ===== Error Handler =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.accepts('html')) {
    return res.status(500).render('error', {
      title: 'خطأ في الخادم',
      message: process.env.NODE_ENV === 'production'
        ? (err.message || 'حدث خطأ غير متوقع')
        : err.message,
      stack: process.env.NODE_ENV === 'production' ? err.stack : null,
    });
  }
  res.status(500).json({ error: 'Server error', message: err.message });
});

// ===== Start =====
async function ensureSchema() {
  // Auto-create tables if they don't exist (self-healing)
  // This way, even if init-db didn't run, the server bootstraps itself.
  const { queryOne, query } = require('./config/db');
  const check = await queryOne(
    "SELECT to_regclass('public.categories') AS cat, to_regclass('public.products') AS prod, to_regclass('public.settings') AS set, to_regclass('public.admin_users') AS adm"
  );
  const missing = [];
  if (!check?.cat) missing.push('categories');
  if (!check?.prod) missing.push('products');
  if (!check?.set) missing.push('settings');
  if (!check?.adm) missing.push('admin_users');
  if (missing.length > 0) {
    console.log('🛠️  Missing tables detected:', missing.join(', '), '— running init-db...');
    try {
      // Run init-db programmatically
      delete require.cache[require.resolve('./scripts/init-db')];
      require('./scripts/init-db.js');
      // Give it a moment
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error('⚠️  Could not auto-init:', err.message);
    }
  } else {
    // Run idempotent migrations for new columns
    try {
      await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_data BYTEA');
      await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_type VARCHAR(50)');

      // Ensure social media settings exist
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

      // Ensure ticker settings exist
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
    } catch (err) {
      console.error('⚠️  Migration error:', err.message);
    }
    console.log('✅ Database schema OK');
  }
}

async function start() {
  const ok = await testConnection();
  if (!ok) {
    console.error('❌ Cannot start: database connection failed.');
    console.error('   Set DATABASE_URL and ensure the DB is reachable.');
    process.exit(1);
  }

  // Self-heal: ensure schema is in place
  await ensureSchema();

  app.listen(PORT, () => {
    console.log(`\n🚀 TECH ZONE server running on port ${PORT}`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Admin: http://localhost:${PORT}/admin/login\n`);
  });
}

start();