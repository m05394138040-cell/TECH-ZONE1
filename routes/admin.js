/**
 * Admin Routes
 * All routes here require admin login (except /admin/login).
 *
 *  /admin/login            - login form + handler
 *  /admin/logout           - clear cookie
 *  /admin                  - dashboard (counts)
 *  /admin/categories       - list + create + delete
 *  /admin/products         - list + create + edit + delete
 *  /admin/products/new     - create form
 *  /admin/products/:id/edit - edit form
 *  /admin/settings         - site settings (whatsapp, logo, name)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const router = express.Router();

const { query, queryOne, queryAll } = require('../config/db');
const { setSetting, getSetting, clearCache } = require('../config/settings');
const {
  requireAdmin,
  issueToken,
  setAuthCookie,
  clearAuthCookie,
} = require('../middleware/auth');

// Multer for image upload (in-memory only; we store bytes in DB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('نوع الصورة غير مدعوم. استخدم JPG, PNG, GIF, WEBP, أو SVG'));
  },
});

// ===== Login =====
router.get('/login', (req, res) => {
  if (req.cookies.tz_admin_token) {
    try {
      const { verifyToken } = require('../middleware/auth');
      if (verifyToken(req.cookies.tz_admin_token)) {
        return res.redirect('/admin');
      }
    } catch {}
  }
  res.render('admin/login', { title: 'تسجيل الدخول', error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const admin = await queryOne(
      'SELECT * FROM admin_users WHERE username = $1',
      [username]
    );
    if (!admin) {
      return res.render('admin/login', {
        title: 'تسجيل الدخول',
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      });
    }
    const ok = await bcrypt.compare(password || '', admin.password_hash);
    if (!ok) {
      return res.render('admin/login', {
        title: 'تسجيل الدخول',
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      });
    }
    const token = issueToken(admin.username);
    setAuthCookie(res, token);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

router.get('/logout', (req, res) => {
  clearAuthCookie(res);
  res.redirect('/admin/login');
});

// ===== All routes below require admin =====
router.use(requireAdmin);

// ===== Dashboard =====
router.get('/', async (req, res, next) => {
  try {
    // Defensive: if a table is missing, count as 0 instead of crashing
    const safeCount = async (sql) => {
      try {
        const row = await queryOne(sql);
        return row?.c ?? 0;
      } catch {
        return 0;
      }
    };
    const stats = {
      categories: await safeCount('SELECT COUNT(*)::int AS c FROM categories'),
      products: await safeCount('SELECT COUNT(*)::int AS c FROM products'),
      available: await safeCount('SELECT COUNT(*)::int AS c FROM products WHERE available = TRUE'),
      unavailable: await safeCount('SELECT COUNT(*)::int AS c FROM products WHERE available = FALSE'),
    };

    // Profit / cost analytics (admin only — price_cost is hidden from public)
    try {
      const profitRow = await queryOne(
        `SELECT
           COALESCE(SUM(price_cost), 0)::float AS total_cost,
           COALESCE(SUM(price), 0)::float AS total_wholesale_value,
           COALESCE(SUM(price - price_cost), 0)::float AS total_profit,
           COUNT(*) FILTER (WHERE price_cost > 0)::int AS products_with_cost
         FROM products
         WHERE available = TRUE`
      );
      const totalWholesale = profitRow?.total_wholesale_value || 0;
      const totalProfit = profitRow?.total_profit || 0;
      const avgMargin = totalWholesale > 0
        ? ((totalProfit / totalWholesale) * 100).toFixed(1)
        : 0;
      stats.total_cost = profitRow?.total_cost || 0;
      stats.total_wholesale_value = totalWholesale;
      stats.total_profit = totalProfit;
      stats.avg_margin = avgMargin;
      stats.products_with_cost = profitRow?.products_with_cost || 0;
    } catch (e) {
      stats.total_cost = 0;
      stats.total_wholesale_value = 0;
      stats.total_profit = 0;
      stats.avg_margin = 0;
      stats.products_with_cost = 0;
    }

    res.render('admin/dashboard', { title: 'لوحة التحكم', stats, active: 'dashboard' });
  } catch (err) {
    next(err);
  }
});

// ===== Categories =====
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await queryAll(
      `SELECT c.*, (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
         FROM categories c
        ORDER BY c.sort_order, c.id`
    );
    res.render('admin/categories', { title: 'إدارة الأقسام', categories, error: null, success: null, active: 'categories' });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', upload.single('image'), async (req, res, next) => {
  try {
    const { name, icon } = req.body;
    if (!name || !name.trim()) {
      const categories = await queryAll('SELECT * FROM categories ORDER BY sort_order, id');
      return res.render('admin/categories', {
        title: 'إدارة الأقسام',
        categories,
        error: 'اسم القسم مطلوب',
        success: null,
        active: 'categories',
      });
    }
    const slug = name.trim().toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 80) || `cat-${Date.now()}`;
    const maxOrder = await queryOne('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories');
    const imageData = req.file ? req.file.buffer : null;
    const imageType = req.file ? req.file.mimetype : null;
    await query(
      'INSERT INTO categories (name, slug, icon, image_data, image_type, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
      [name.trim(), slug, icon || '', imageData, imageType, (maxOrder?.m || 0) + 1]
    );
    res.redirect('/admin/categories');
  } catch (err) {
    next(err);
  }
});

router.post('/categories/:id/delete', async (req, res, next) => {
  try {
    await query('DELETE FROM categories WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.redirect('/admin/categories');
  } catch (err) {
    next(err);
  }
});

// Move category up in sort order
router.post('/categories/:id/move-up', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const current = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);
    if (!current) return res.redirect('/admin/categories');

    // Find the category just before this one (lower sort_order)
    const above = await queryOne(
      `SELECT * FROM categories
       WHERE sort_order < $1
       ORDER BY sort_order DESC, id DESC
       LIMIT 1`,
      [current.sort_order]
    );
    if (!above) {
      // Already at the top
      return res.redirect('/admin/categories');
    }

    // Swap sort_order values
    await query('UPDATE categories SET sort_order = $1 WHERE id = $2', [above.sort_order, current.id]);
    await query('UPDATE categories SET sort_order = $1 WHERE id = $2', [current.sort_order, above.id]);
    res.redirect('/admin/categories');
  } catch (err) {
    next(err);
  }
});

// ===== Wholesale Users Management =====

// List all wholesale users
router.get('/wholesale-users', async (req, res, next) => {
  try {
    const users = await queryAll(
      'SELECT id, username, name, phone, is_active, last_login, created_at FROM wholesale_users ORDER BY created_at DESC'
    );
    res.render('admin/wholesale-users', {
      title: 'أصحاب المحلات',
      users,
      error: null,
      success: null,
      active: 'wholesale-users',
    });
  } catch (err) {
    next(err);
  }
});

// Create a new wholesale user
router.post('/wholesale-users', async (req, res, next) => {
  try {
    const { username, password, name, phone, notes } = req.body;
    if (!username || !password) {
      const users = await queryAll('SELECT id, username, name, phone, is_active, last_login, created_at FROM wholesale_users ORDER BY created_at DESC');
      return res.render('admin/wholesale-users', {
        title: 'أصحاب المحلات',
        users,
        error: 'اسم المستخدم وكلمة المرور مطلوبين',
        success: null,
        active: 'wholesale-users',
      });
    }
    if (password.length < 4) {
      const users = await queryAll('SELECT id, username, name, phone, is_active, last_login, created_at FROM wholesale_users ORDER BY created_at DESC');
      return res.render('admin/wholesale-users', {
        title: 'أصحاب المحلات',
        users,
        error: 'كلمة المرور قصيرة جداً (4 أحرف على الأقل)',
        success: null,
        active: 'wholesale-users',
      });
    }

    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO wholesale_users (username, password_hash, name, phone, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [username.trim(), hash, name || null, phone || null, notes || null]
    );
    res.redirect('/admin/wholesale-users');
  } catch (err) {
    if (err.code === '23505') {
      const users = await queryAll('SELECT id, username, name, phone, is_active, last_login, created_at FROM wholesale_users ORDER BY created_at DESC');
      return res.render('admin/wholesale-users', {
        title: 'أصحاب المحلات',
        users,
        error: 'اسم المستخدم موجود مسبقاً',
        success: null,
        active: 'wholesale-users',
      });
    }
    next(err);
  }
});

// Update a wholesale user
router.post('/wholesale-users/:id/update', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone, notes, password, is_active } = req.body;

    if (password && password.length >= 4) {
      const hash = await bcrypt.hash(password, 10);
      await query(
        `UPDATE wholesale_users SET name = $1, phone = $2, notes = $3, is_active = $4, password_hash = $5 WHERE id = $6`,
        [name || null, phone || null, notes || null, is_active === 'on' || is_active === 'true', hash, id]
      );
    } else {
      await query(
        `UPDATE wholesale_users SET name = $1, phone = $2, notes = $3, is_active = $4 WHERE id = $5`,
        [name || null, phone || null, notes || null, is_active === 'on' || is_active === 'true', id]
      );
    }
    res.redirect('/admin/wholesale-users');
  } catch (err) {
    next(err);
  }
});

// Delete a wholesale user
router.post('/wholesale-users/:id/delete', async (req, res, next) => {
  try {
    await query('DELETE FROM wholesale_users WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.redirect('/admin/wholesale-users');
  } catch (err) {
    next(err);
  }
});
router.post('/categories/:id/move-down', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const current = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);
    if (!current) return res.redirect('/admin/categories');

    // Find the category just after this one (higher sort_order)
    const below = await queryOne(
      `SELECT * FROM categories
       WHERE sort_order > $1
       ORDER BY sort_order ASC, id ASC
       LIMIT 1`,
      [current.sort_order]
    );
    if (!below) {
      // Already at the bottom
      return res.redirect('/admin/categories');
    }

    // Swap sort_order values
    await query('UPDATE categories SET sort_order = $1 WHERE id = $2', [below.sort_order, current.id]);
    await query('UPDATE categories SET sort_order = $1 WHERE id = $2', [current.sort_order, below.id]);
    res.redirect('/admin/categories');
  } catch (err) {
    next(err);
  }
});

router.post('/categories/:id/update', upload.single('image'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, icon, remove_image } = req.body;
    if (req.file) {
      await query(
        'UPDATE categories SET name = $1, icon = $2, image_data = $3, image_type = $4 WHERE id = $5',
        [name.trim(), icon || '', req.file.buffer, req.file.mimetype, id]
      );
    } else if (remove_image === '1') {
      await query(
        'UPDATE categories SET name = $1, icon = $2, image_data = NULL, image_type = NULL WHERE id = $3',
        [name.trim(), icon || '', id]
      );
    } else {
      await query('UPDATE categories SET name = $1, icon = $2 WHERE id = $3',
        [name.trim(), icon || '', id]);
    }
    res.redirect('/admin/categories');
  } catch (err) {
    next(err);
  }
});

// ===== Products =====
router.get('/products', async (req, res, next) => {
  try {
    const products = await queryAll(
      `SELECT p.*, c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
        ORDER BY p.created_at DESC`
    );
    res.render('admin/products', { title: 'إدارة المنتجات', products, error: null, success: null, active: 'products' });
  } catch (err) {
    next(err);
  }
});

router.get('/products/new', async (req, res, next) => {
  try {
    const categories = await queryAll('SELECT * FROM categories ORDER BY sort_order, id');
    res.render('admin/product-form', {
      title: 'إضافة منتج',
      product: null,
      categories,
      error: null,
      active: 'product-new',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/products/new', upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, price_retail, price_cost, available, category_id } = req.body;
    if (!name || !price || !category_id) {
      const categories = await queryAll('SELECT * FROM categories ORDER BY sort_order, id');
      return res.render('admin/product-form', {
        title: 'إضافة منتج',
        product: req.body,
        categories,
        error: 'الاسم والسعر والقسم مطلوبين',
        active: 'product-new',
      });
    }
    const imageData = req.file ? req.file.buffer : null;
    const imageType = req.file ? req.file.mimetype : null;
    const isAvailable = available === 'on' || available === 'true';
    const retailPrice = price_retail && parseFloat(price_retail) > 0
      ? parseFloat(price_retail)
      : parseFloat(price);
    const costPrice = price_cost && parseFloat(price_cost) > 0
      ? parseFloat(price_cost)
      : 0;
    await query(
      `INSERT INTO products (category_id, name, description, price, price_retail, price_cost, available, image_data, image_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [parseInt(category_id, 10), name.trim(), description || '', parseFloat(price), retailPrice, costPrice, isAvailable, imageData, imageType]
    );
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = await queryOne('SELECT * FROM products WHERE id = $1', [id]);
    if (!product) return res.redirect('/admin/products');
    const categories = await queryAll('SELECT * FROM categories ORDER BY sort_order, id');
    res.render('admin/product-form', {
      title: 'تعديل منتج',
      product,
      categories,
      error: null,
      active: 'products',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/edit', upload.single('image'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, price, price_retail, price_cost, available, category_id, remove_image } = req.body;
    const isAvailable = available === 'on' || available === 'true';
    const retailPrice = price_retail && parseFloat(price_retail) > 0
      ? parseFloat(price_retail)
      : parseFloat(price);
    const costPrice = price_cost && parseFloat(price_cost) > 0
      ? parseFloat(price_cost)
      : 0;

    if (req.file) {
      await query(
        `UPDATE products
            SET name = $1, description = $2, price = $3, price_retail = $4, price_cost = $5, available = $6,
                category_id = $7, image_data = $8, image_type = $9, updated_at = NOW()
          WHERE id = $10`,
        [name.trim(), description || '', parseFloat(price), retailPrice, costPrice, isAvailable,
         parseInt(category_id, 10), req.file.buffer, req.file.mimetype, id]
      );
    } else if (remove_image === '1') {
      await query(
        `UPDATE products
            SET name = $1, description = $2, price = $3, price_retail = $4, price_cost = $5, available = $6,
                category_id = $7, image_data = NULL, image_type = NULL, updated_at = NOW()
          WHERE id = $8`,
        [name.trim(), description || '', parseFloat(price), retailPrice, costPrice, isAvailable,
         parseInt(category_id, 10), id]
      );
    } else {
      await query(
        `UPDATE products
            SET name = $1, description = $2, price = $3, price_retail = $4, price_cost = $5, available = $6,
                category_id = $7, updated_at = NOW()
          WHERE id = $8`,
        [name.trim(), description || '', parseFloat(price), retailPrice, costPrice, isAvailable,
         parseInt(category_id, 10), id]
      );
    }
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/delete', async (req, res, next) => {
  try {
    await query('DELETE FROM products WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/toggle', async (req, res, next) => {
  try {
    await query(
      'UPDATE products SET available = NOT available, updated_at = NOW() WHERE id = $1',
      [parseInt(req.params.id, 10)]
    );
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
});

// ===== Settings =====
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await require('../config/settings').getAllSettings();
    res.render('admin/settings', { title: 'الإعدادات', settings, error: null, success: null, active: 'settings' });
  } catch (err) {
    next(err);
  }
});

router.post('/settings', upload.single('logo'), async (req, res, next) => {
  try {
    const { whatsapp_number, site_name, logo_text, remove_logo } = req.body;
    const socialFields = [
      'social_youtube',
      'social_facebook',
      'social_instagram',
      'social_twitter',
      'social_tiktok',
      'social_whatsapp',
    ];

    await setSetting('whatsapp_number', (whatsapp_number || '').trim());
    await setSetting('site_name', (site_name || 'TECH ZONE').trim());
    await setSetting('logo_text', (logo_text || site_name || 'TECH ZONE').trim());

    // Save social media URLs
    for (const field of socialFields) {
      let value = (req.body[field] || '').trim();
      // Auto-prepend https:// if missing
      if (value && !value.match(/^https?:\/\//i)) {
        value = 'https://' + value;
      }
      await setSetting(field, value);
    }

    // Save ticker settings
    const tickerEnabled = req.body.ticker_enabled === 'on' || req.body.ticker_enabled === 'true';
    await setSetting('ticker_enabled', tickerEnabled ? 'true' : 'false');
    await setSetting('ticker_text', (req.body.ticker_text || '').trim());
    await setSetting('ticker_color', (req.body.ticker_color || '#ffffff').trim());
    await setSetting('ticker_bg_color', (req.body.ticker_bg_color || '#0a0a0a').trim());

    // Save wholesale currency settings
    await setSetting('wholesale_currency', (req.body.wholesale_currency || 'USD').trim().toUpperCase());
    await setSetting('wholesale_symbol', (req.body.wholesale_symbol || '$').trim());
    await setSetting('retail_currency', (req.body.retail_currency || 'TRY').trim().toUpperCase());
    await setSetting('retail_symbol', (req.body.retail_symbol || '₺').trim());
    // exchange_rate setting is no longer used (each product has manual prices),
    // but we keep reading it for backward compatibility with any old forms
    if (req.body.exchange_rate !== undefined) {
      const rate = parseFloat(req.body.exchange_rate) || 32;
      await setSetting('exchange_rate', String(rate));
    }

    if (req.file) {
      // store logo as base64
      await setSetting('logo_image', req.file.buffer.toString('base64'));
      await setSetting('logo_image_type', req.file.mimetype);
    } else if (remove_logo === '1') {
      await setSetting('logo_image', '');
      await setSetting('logo_image_type', '');
    }

    const settings = await require('../config/settings').getAllSettings();
    res.render('admin/settings', {
      title: 'الإعدادات',
      settings,
      error: null,
      success: 'تم حفظ الإعدادات بنجاح',
      active: 'settings',
    });
  } catch (err) {
    next(err);
  }
});


// ===== Slider management =====
router.get('/slider', async (req, res, next) => {
  try {
    const images = await queryAll(
      'SELECT id, title, link_url, image_type, sort_order, is_active, created_at FROM slider_images ORDER BY sort_order, id DESC'
    );
    res.render('admin/slider', {
      title: 'سلايدر العروض',
      images,
      error: null,
      success: null,
      active: 'slider',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/slider/new', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      const images = await queryAll('SELECT id, title, link_url, image_type, sort_order, is_active, created_at FROM slider_images ORDER BY sort_order, id DESC');
      return res.render('admin/slider', {
        title: 'سلايدر العروض',
        images,
        error: 'الرجاء اختيار صورة',
        success: null,
        active: 'slider',
      });
    }
    const { title = '', link_url = '' } = req.body;
    // Get the next sort_order
    const maxRow = await queryOne('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM slider_images');
    const nextOrder = (maxRow?.max_order ?? -1) + 1;
    await query(
      `INSERT INTO slider_images (title, link_url, image_data, image_type, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [title.trim(), link_url.trim(), req.file.buffer, req.file.mimetype, nextOrder]
    );
    res.redirect('/admin/slider');
  } catch (err) {
    next(err);
  }
});

router.post('/slider/:id/delete', async (req, res, next) => {
  try {
    await query('DELETE FROM slider_images WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.redirect('/admin/slider');
  } catch (err) {
    next(err);
  }
});

router.post('/slider/:id/toggle', async (req, res, next) => {
  try {
    await query('UPDATE slider_images SET is_active = NOT is_active WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.redirect('/admin/slider');
  } catch (err) {
    next(err);
  }
});

router.post('/slider/:id/update', async (req, res, next) => {
  try {
    const { title = '', link_url = '' } = req.body;
    await query(
      'UPDATE slider_images SET title = $1, link_url = $2 WHERE id = $3',
      [title.trim(), link_url.trim(), parseInt(req.params.id, 10)]
    );
    res.redirect('/admin/slider');
  } catch (err) {
    next(err);
  }
});

router.post('/slider/reorder', async (req, res, next) => {
  try {
    const order = req.body.order; // array of IDs
    if (Array.isArray(order)) {
      for (let i = 0; i < order.length; i++) {
        await query(
          'UPDATE slider_images SET sort_order = $1 WHERE id = $2',
          [i, parseInt(order[i], 10)]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// ===== Wholesale Applications Management =====
router.get('/wholesale-applications', async (req, res, next) => {
  try {
    const filter = req.query.status || 'pending';
    const where = filter === 'all' ? '' : "WHERE status = $1";
    const params = filter === 'all' ? [] : [filter];
    const applications = await queryAll(
      `SELECT * FROM wholesale_applications ${where} ORDER BY created_at DESC`,
      params
    );
    res.render('admin/wholesale-applications', {
      title: 'طلبات الشركاء',
      applications,
      filter,
      error: null,
      success: null,
      active: 'wholesale-applications',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/wholesale-applications/:id/approve', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const app = await queryOne('SELECT * FROM wholesale_applications WHERE id = $1', [id]);
    if (!app) {
      const applications = await queryAll("SELECT * FROM wholesale_applications WHERE status = 'pending' ORDER BY created_at DESC");
      return res.render('admin/wholesale-applications', {
        title: 'طلبات الشركاء',
        applications,
        filter: 'pending',
        error: 'الطلب غير موجود',
        success: null,
        active: 'wholesale-applications',
      });
    }
    if (app.status !== 'pending') {
      const applications = await queryAll("SELECT * FROM wholesale_applications WHERE status = 'pending' ORDER BY created_at DESC");
      return res.render('admin/wholesale-applications', {
        title: 'طلبات الشركاء',
        applications,
        filter: 'pending',
        error: 'تم معالجة هذا الطلب مسبقاً',
        success: null,
        active: 'wholesale-applications',
      });
    }

    // Check if username already exists in wholesale_users
    const existing = await queryOne('SELECT id FROM wholesale_users WHERE username = $1', [app.username]);
    if (existing) {
      const applications = await queryAll("SELECT * FROM wholesale_applications WHERE status = 'pending' ORDER BY created_at DESC");
      return res.render('admin/wholesale-applications', {
        title: 'طلبات الشركاء',
        applications,
        filter: 'pending',
        error: 'اسم المستخدم موجود مسبقاً في قائمة الشركاء',
        success: null,
        active: 'wholesale-applications',
      });
    }

    // Create the wholesale user from the application
    await query(
      `INSERT INTO wholesale_users (username, password_hash, name, phone, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [app.username, app.password_hash, app.name, app.phone, 'تمت الموافقة من طلب رقم ' + id]
    );

    // Mark application as approved
    await query(
      "UPDATE wholesale_applications SET status = 'approved', reviewed_at = NOW() WHERE id = $1",
      [id]
    );

    // Build the WhatsApp message
    const siteUrl = process.env.SITE_URL || 'https://tech-zone1.onrender.com';
    const waMessage = `🎉 أهلاً وسهلاً ${app.name}!\n\nشكراً لك على تقديم طلب الشراكة مع TECH ZONE.\n\n✅ تم قبول طلبك بنجاح!\n\nيمكنك الآن تصفح جميع المنتجات بأسعار الجملة الحصرية عبر الرابط:\n${siteUrl}\n\nاسم المستخدم: ${app.username}\n\nنتمنى لك تجربة تسوق ممتعة! 🛍️`;

    // Normalize phone: strip non-digits
    const cleanPhone = (app.phone || '').replace(/[^0-9]/g, '');
    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}` : null;

    // Create in-app notification for the applicant
    await query(
      `INSERT INTO notifications (phone, type, title, message, icon, link)
       VALUES ($1, 'wholesale_approved', $2, $3, $4, $5)`,
      [
        app.phone,
        'تم قبول طلبك كشريك جملة! 🎉',
        `أهلاً ${app.name}!\n\nيسعدنا إبلاغك بأنه تم قبول طلبك للانضمام كشريك جملة في TECH ZONE.\n\nاسم المستخدم: ${app.username}\nالرابط: ${siteUrl}\n\nيمكنك الآن تسجيل الدخول والتصفح بأسعار الجملة الحصرية.`,
        '🎉',
        '/wholesale-login',
      ]
    );

    // Send via WhatsApp bot if connected
    let botSent = false;
    let botError = null;
    try {
      const bot = require('../bot/whatsapp-bot');
      const waMessage = `🎉 أهلاً وسهلاً ${app.name}!\n\nشكراً لك على تقديم طلب الشراكة مع TECH ZONE.\n\n✅ تم قبول طلبك بنجاح!\n\nيمكنك الآن تصفح جميع المنتجات بأسعار الجملة الحصرية عبر الرابط:\n${siteUrl}\n\nاسم المستخدم: ${app.username}\nكلمة المرور: (التي اخترتها عند التقديم)\n\nنتمنى لك تجربة تسوق ممتعة! 🛍️`;
      const result = await bot.sendMessage(app.phone, waMessage);
      botSent = result.ok;
      if (!result.ok) botError = result.error;
    } catch (e) {
      botError = e.message;
    }

    // Re-fetch applications and show success
    const applications = await queryAll("SELECT * FROM wholesale_applications ORDER BY created_at DESC");
    let successMsg = `تمت الموافقة على طلب ${app.name} بنجاح! تم إنشاء حسابه وإرسال إشعار داخل الموقع.`;
    if (botSent) {
      successMsg += ` ✅ تم إرسال رسالة واتساب تلقائياً إلى ${app.phone}.`;
    } else {
      successMsg += ` ⚠️ لم يتم إرسال الواتساب (${botError || 'البوت غير متصل'}) - يمكنك استخدام الزر اليدوي.`;
    }
    res.render('admin/wholesale-applications', {
      title: 'طلبات الشركاء',
      applications,
      filter: 'all',
      error: null,
      success: successMsg,
      waLink,
      waPhone: cleanPhone,
      waName: app.name,
      botSent,
      active: 'wholesale-applications',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/wholesale-applications/:id/reject', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const app = await queryOne('SELECT * FROM wholesale_applications WHERE id = $1', [id]);
    if (!app) {
      const applications = await queryAll("SELECT * FROM wholesale_applications WHERE status = 'pending' ORDER BY created_at DESC");
      return res.render('admin/wholesale-applications', {
        title: 'طلبات الشركاء',
        applications,
        filter: 'pending',
        error: 'الطلب غير موجود',
        success: null,
        active: 'wholesale-applications',
      });
    }
    if (app.status !== 'pending') {
      const applications = await queryAll("SELECT * FROM wholesale_applications WHERE status = 'pending' ORDER BY created_at DESC");
      return res.render('admin/wholesale-applications', {
        title: 'طلبات الشركاء',
        applications,
        filter: 'pending',
        error: 'تم معالجة هذا الطلب مسبقاً',
        success: null,
        active: 'wholesale-applications',
      });
    }

    await query(
      "UPDATE wholesale_applications SET status = 'rejected', reviewed_at = NOW() WHERE id = $1",
      [id]
    );

    // Create in-app notification for the rejected applicant
    await query(
      `INSERT INTO notifications (phone, type, title, message, icon, link)
       VALUES ($1, 'wholesale_rejected', $2, $3, '😔', '/wholesale-apply')`,
      [
        app.phone,
        'نعتذر، لم يتم قبول طلبك 😔',
        `مرحباً ${app.name}،\n\nنشكرك على اهتمامك بالانضمام كشريك جملة في TECH ZONE.\n\nبعد مراجعة طلبك، نأسف لإبلاغك بأنه لم يتم قبول الطلب حالياً لعدم استيفاء المتطلبات.\n\nيمكنك إعادة التقديم لاحقاً أو التواصل معنا للمزيد من المعلومات.`,
      ]
    );

    const applications = await queryAll("SELECT * FROM wholesale_applications ORDER BY created_at DESC");
    res.render('admin/wholesale-applications', {
      title: 'طلبات الشركاء',
      applications,
      filter: 'all',
      error: null,
      success: `تم رفض طلب ${app.name}. ❌ سيتم إبلاغه عبر إشعار في الموقع.`,
      rejected: true,
      active: 'wholesale-applications',
    });
  } catch (err) {
    next(err);
  }
});


// ===== Admin: Notifications =====
router.get('/notifications', async (req, res, next) => {
  try {
    const phone = (req.query.phone || '').trim();
    let notifications = [];
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      notifications = await queryAll(
        `SELECT * FROM notifications
          WHERE phone = $1 OR phone LIKE $2 OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE $2
          ORDER BY created_at DESC
          LIMIT 100`,
        [phone, '%' + cleanPhone + '%']
      );
    } else {
      notifications = await queryAll(
        `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100`
      );
    }
    const totalCount = notifications.length;
    const unreadCount = notifications.filter(n => !n.is_read).length;
    res.render('admin/notifications', {
      title: 'الإشعارات',
      notifications,
      phone,
      totalCount,
      unreadCount,
      error: null,
      success: null,
      active: 'notifications',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/delete', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await query('DELETE FROM notifications WHERE id = $1', [id]);
    res.redirect('/admin/notifications');
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/broadcast', async (req, res, next) => {
  try {
    const { title, message, type, icon } = req.body;
    if (!title || !message) {
      const notifications = await queryAll("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100");
      return res.render('admin/notifications', {
        title: 'الإشعارات',
        notifications,
        phone: '',
        totalCount: notifications.length,
        unreadCount: notifications.filter(n => !n.is_read).length,
        error: 'العنوان والرسالة مطلوبان',
        success: null,
        active: 'notifications',
      });
    }
    // Send to all wholesale users
    const users = await queryAll("SELECT phone FROM wholesale_users WHERE is_active = TRUE AND phone IS NOT NULL AND phone != ''");
    for (const u of users) {
      await query(
        `INSERT INTO notifications (phone, type, title, message, icon) VALUES ($1, $2, $3, $4, $5)`,
        [u.phone, type || 'broadcast', title, message, icon || '📢']
      );
    }
    res.redirect('/admin/notifications?success=broadcast');
  } catch (err) {
    next(err);
  }
});


module.exports = router;