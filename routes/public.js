/**
 * Public Routes (customer-facing)
 *  GET /                - home: list of all categories
 *  GET /category/:slug  - category page: products in that category
 *  GET /product/:id     - product detail with WhatsApp order form
 */

const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../config/db');

// ===== Home: list categories =====
router.get('/', async (req, res, next) => {
  try {
    const categories = await queryAll(
      `SELECT c.id, c.name, c.slug, c.icon, c.image_type,
              (SELECT COUNT(*) FROM products p
                WHERE p.category_id = c.id AND p.available = TRUE) AS product_count
         FROM categories c
        ORDER BY c.sort_order, c.id`
    );
    res.render('index', { title: res.locals.siteName, categories });
  } catch (err) {
    next(err);
  }
});

// ===== Category page: products in this category =====
router.get('/category/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const category = await queryOne('SELECT * FROM categories WHERE slug = $1', [slug]);
    if (!category) {
      return res.status(404).render('404', { title: 'القسم غير موجود' });
    }
    const products = await queryAll(
      `SELECT id, name, description, price, available, image_type
         FROM products
        WHERE category_id = $1
        ORDER BY sort_order, id`,
      [category.id]
    );
    res.render('category', {
      title: category.name,
      category,
      products,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Product detail =====
router.get('/product/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(404).render('404', { title: 'منتج غير موجود' });

    const product = await queryOne(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1`,
      [id]
    );
    if (!product) return res.status(404).render('404', { title: 'منتج غير موجود' });

    res.render('product', {
      title: product.name,
      product,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Image stream: /img/:id =====
router.get('/img/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(404).end();

    const row = await queryOne('SELECT image_data, image_type FROM products WHERE id = $1', [id]);
    if (!row || !row.image_data) {
      // Return 1x1 transparent gif as a placeholder
      const placeholder = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
      );
      res.set('Content-Type', 'image/gif');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(placeholder);
    }

    res.set('Content-Type', row.image_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // 24h
    res.send(row.image_data);
  } catch (err) {
    next(err);
  }
});

// ===== Category image: /cat-img/:id =====
router.get('/cat-img/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(404).end();
    const row = await queryOne('SELECT image_data, image_type FROM categories WHERE id = $1', [id]);
    if (!row || !row.image_data) {
      // Empty 1x1 transparent gif (frontend will fall back to emoji)
      const placeholder = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
      );
      res.set('Content-Type', 'image/gif');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(placeholder);
    }
    res.set('Content-Type', row.image_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(row.image_data);
  } catch (err) {
    next(err);
  }
});

// ===== Logo stream: /logo =====
router.get('/logo', async (req, res, next) => {
  try {
    const { queryOne } = require('../config/db');
    const row = await queryOne(
      "SELECT value FROM settings WHERE key = 'logo_image'"
    );
    const typeRow = await queryOne(
      "SELECT value FROM settings WHERE key = 'logo_image_type'"
    );

    if (!row || !row.value) {
      // No logo image set; return empty so template uses text logo
      return res.status(204).end();
    }
    const buf = Buffer.from(row.value, 'base64');
    res.set('Content-Type', typeRow?.value || 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;