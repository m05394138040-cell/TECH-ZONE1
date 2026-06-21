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

router.post('/categories', async (req, res, next) => {
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
    await query(
      'INSERT INTO categories (name, slug, icon, sort_order) VALUES ($1, $2, $3, $4)',
      [name.trim(), slug, icon || '', (maxOrder?.m || 0) + 1]
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

router.post('/categories/:id/update', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, icon } = req.body;
    await query('UPDATE categories SET name = $1, icon = $2 WHERE id = $3',
      [name.trim(), icon || '', id]);
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
    const { name, description, price, available, category_id } = req.body;
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
    await query(
      `INSERT INTO products (category_id, name, description, price, available, image_data, image_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [parseInt(category_id, 10), name.trim(), description || '', parseFloat(price), isAvailable, imageData, imageType]
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
    const { name, description, price, available, category_id, remove_image } = req.body;
    const isAvailable = available === 'on' || available === 'true';

    if (req.file) {
      await query(
        `UPDATE products
            SET name = $1, description = $2, price = $3, available = $4,
                category_id = $5, image_data = $6, image_type = $7, updated_at = NOW()
          WHERE id = $8`,
        [name.trim(), description || '', parseFloat(price), isAvailable,
         parseInt(category_id, 10), req.file.buffer, req.file.mimetype, id]
      );
    } else if (remove_image === '1') {
      await query(
        `UPDATE products
            SET name = $1, description = $2, price = $3, available = $4,
                category_id = $5, image_data = NULL, image_type = NULL, updated_at = NOW()
          WHERE id = $6`,
        [name.trim(), description || '', parseFloat(price), isAvailable,
         parseInt(category_id, 10), id]
      );
    } else {
      await query(
        `UPDATE products
            SET name = $1, description = $2, price = $3, available = $4,
                category_id = $5, updated_at = NOW()
          WHERE id = $6`,
        [name.trim(), description || '', parseFloat(price), isAvailable,
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
    await setSetting('whatsapp_number', (whatsapp_number || '').trim());
    await setSetting('site_name', (site_name || 'TECH ZONE').trim());
    await setSetting('logo_text', (logo_text || site_name || 'TECH ZONE').trim());

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

module.exports = router;