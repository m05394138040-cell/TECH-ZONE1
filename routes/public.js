/**
 * Public Routes (customer-facing)
 *  GET /                - home: list of all categories
 *  GET /category/:slug  - category page: products in that category
 *  GET /product/:id     - product detail with WhatsApp order form
 */

const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../config/db');

// ===== Contact page =====
router.get('/contact', async (req, res, next) => {
  try {
    res.render('contact', { title: 'تواصل معنا' });
  } catch (err) {
    next(err);
  }
});

// ===== Home: slider + latest products (paginated) + categories =====
const PRODUCTS_PER_PAGE = 12;

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PRODUCTS_PER_PAGE;

    // Count total available products for pagination
    const totalRow = await queryOne(
      'SELECT COUNT(*)::int AS c FROM products WHERE available = TRUE'
    );
    const totalProducts = totalRow?.c || 0;
    const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);

    // Recompute offset in case currentPage was clamped
    const safeOffset = (currentPage - 1) * PRODUCTS_PER_PAGE;

    // Fetch latest products (don't include price_cost — admin only)
    // We select created_at so the view can show the 'جديد' badge for products < 24h old
    const latestProducts = await queryAll(
      `SELECT p.id, p.name, p.price, p.price_retail, p.image_type, p.available,
              p.created_at,
              c.name AS category_name, c.slug AS category_slug
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE p.available = TRUE
        ORDER BY p.id DESC
        LIMIT $1 OFFSET $2`,
      [PRODUCTS_PER_PAGE, safeOffset]
    );

    // Categories
    const categories = await queryAll(
      `SELECT c.id, c.name, c.slug, c.icon, c.image_type,
              (SELECT COUNT(*) FROM products p
                WHERE p.category_id = c.id AND p.available = TRUE) AS product_count
         FROM categories c
        ORDER BY c.sort_order, c.id`
    );

    // Active slider images
    const sliderImages = await queryAll(
      `SELECT id, title, link_url
         FROM slider_images
        WHERE is_active = TRUE
        ORDER BY sort_order, id DESC`
    );

    res.render('index', {
      title: res.locals.siteName,
      categories,
      sliderImages,
      latestProducts,
      currentPage,
      totalPages,
      totalProducts,
      productsPerPage: PRODUCTS_PER_PAGE,
    });
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
      `SELECT id, name, description, price, price_retail, available, image_type
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
      `SELECT p.id, p.name, p.description, p.price, p.price_retail, p.available,
              p.image_type, p.category_id,
              c.name AS category_name, c.slug AS category_slug
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

// ===== Live search API: /api/search?q=... =====
router.get('/api/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) {
      return res.json({ results: [], query: q, count: 0, isWholesale: false });
    }
    const pattern = `%${q}%`;
    // Only return columns the public needs (no price_cost — admin only)
    const results = await queryAll(
      `SELECT p.id, p.name, p.description, p.price, p.price_retail, p.image_type,
              c.name AS category_name, c.slug AS category_slug
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE p.available = TRUE
          AND (p.name ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1)
        ORDER BY
          CASE WHEN p.name ILIKE $1 THEN 0 ELSE 1 END,
          p.id DESC
        LIMIT 20`,
      [pattern]
    );
    // Use the same res.locals.isWholesale set by the attachWholesaleToViews middleware
    const isWholesale = !!res.locals.isWholesale;
    res.json({
      results,
      query: q,
      count: results.length,
      isWholesale,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Full search results page: /search?q=... =====
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    let results = [];
    if (q.length >= 1) {
      const pattern = `%${q}%`;
      results = await queryAll(
        `SELECT p.id, p.name, p.description, p.price, p.price_retail, p.image_type,
                c.name AS category_name, c.slug AS category_slug
           FROM products p
           JOIN categories c ON c.id = p.category_id
          WHERE p.available = TRUE
            AND (p.name ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1)
          ORDER BY
            CASE WHEN p.name ILIKE $1 THEN 0 ELSE 1 END,
            p.id DESC
          LIMIT 60`,
        [pattern]
      );
    }
    res.render('search', {
      title: q ? `بحث: ${q}` : 'بحث',
      query: q,
      results,
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

// ===== Slider image stream: /slider-img/:id =====
router.get('/slider-img/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(404).end();
    const row = await queryOne(
      'SELECT image_data, image_type FROM slider_images WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    if (!row || !row.image_data) {
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