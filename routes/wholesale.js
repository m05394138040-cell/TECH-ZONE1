/**
 * Wholesale customer routes
 *  POST /wholesale-login  - login
 *  GET  /wholesale-logout - logout
 *  GET  /wholesale-info   - current user info (JSON)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { queryOne, query, queryAll } = require('../config/db');
const { issueToken, setAuthCookie, clearAuthCookie } = require('../middleware/wholesaleAuth');

// Show login page
router.get('/wholesale-login', (req, res) => {
  if (req.cookies.tz_wholesale_token) {
    try {
      const { verifyToken } = require('../middleware/wholesaleAuth');
      if (verifyToken(req.cookies.tz_wholesale_token)) {
        return res.redirect('/');
      }
    } catch {}
  }
  res.render('wholesale-login', { title: 'دخول صاحب المحل', error: null, success: null });
});

// Handle login
router.post('/wholesale-login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.render('wholesale-login', {
        title: 'دخول صاحب المحل',
        error: 'يرجى إدخال اسم المستخدم وكلمة المرور',
        success: null,
      });
    }

    const user = await queryOne(
      'SELECT * FROM wholesale_users WHERE username = $1',
      [username.trim()]
    );

    if (!user || !user.is_active) {
      return res.render('wholesale-login', {
        title: 'دخول صاحب المحل',
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        success: null,
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render('wholesale-login', {
        title: 'دخول صاحب المحل',
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        success: null,
      });
    }

    // Update last login
    const { query } = require('../config/db');
    await query('UPDATE wholesale_users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Issue token
    const token = issueToken(user.username);
    setAuthCookie(res, token);
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

// Logout
router.get('/wholesale-logout', (req, res) => {
  clearAuthCookie(res);
  res.redirect('/');
});

// Show wholesale application form
router.get('/wholesale-apply', (req, res) => {
  res.render('wholesale-apply', {
    title: 'تقديم طلب شريك جملة',
    states: ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"],
    volumeRanges: ["0$ - 100$", "100$ - 200$", "200$ - 300$", "300$ - 400$", "400$ - 500$", "500$ - 600$", "600$ - 700$", "700$ - 800$", "800$ - 900$", "900$ - 1000$", "1000$+"],
    error: null,
    formData: {},
  });
});

// Handle wholesale application submission
router.post('/wholesale-apply', async (req, res, next) => {
  try {
    const { name, phone, state, username, password, volume_range, notes } = req.body;

    // Validation
    const errors = [];
    if (!name || name.trim().length < 2) errors.push('الاسم مطلوب');
    if (!phone || phone.trim().length < 7) errors.push('رقم الهاتف مطلوب');
    if (!state) errors.push('الولاية مطلوبة');
    if (!username || username.trim().length < 3) errors.push('اسم المستخدم يجب أن يكون 3 أحرف على الأقل');
    if (!password || password.length < 4) errors.push('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
    if (!volume_range) errors.push('حجم المشتريات المتوقع مطلوب');

    if (errors.length > 0) {
      return res.render('wholesale-apply', {
        title: 'تقديم طلب شريك جملة',
        states: ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"],
        volumeRanges: ["0$ - 100$", "100$ - 200$", "200$ - 300$", "300$ - 400$", "400$ - 500$", "500$ - 600$", "600$ - 700$", "700$ - 800$", "800$ - 900$", "900$ - 1000$", "1000$+"],
        error: errors.join(' • '),
        formData: req.body,
      });
    }

    // Check if username already exists in users or pending applications
    const existingUser = await queryOne(
      'SELECT id FROM wholesale_users WHERE username = $1',
      [username.trim()]
    );
    const existingApp = await queryOne(
      "SELECT id FROM wholesale_applications WHERE username = $1 AND status = 'pending'",
      [username.trim()]
    );

    if (existingUser || existingApp) {
      return res.render('wholesale-apply', {
        title: 'تقديم طلب شريك جملة',
        states: ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"],
        volumeRanges: ["0$ - 100$", "100$ - 200$", "200$ - 300$", "300$ - 400$", "400$ - 500$", "500$ - 600$", "600$ - 700$", "700$ - 800$", "800$ - 900$", "900$ - 1000$", "1000$+"],
        error: 'اسم المستخدم هذا محجوز، يرجى اختيار اسم آخر',
        formData: req.body,
      });
    }

    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO wholesale_applications
         (name, phone, state, username, password_hash, volume_range, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [
        name.trim(),
        phone.trim(),
        state,
        username.trim(),
        hash,
        volume_range,
        (notes || '').trim(),
      ]
    );

    res.render('wholesale-apply', {
      title: 'تم تقديم الطلب',
      states: ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"],
      volumeRanges: ["0$ - 100$", "100$ - 200$", "200$ - 300$", "300$ - 400$", "400$ - 500$", "500$ - 600$", "600$ - 700$", "700$ - 800$", "800$ - 900$", "900$ - 1000$", "1000$+"],
      error: null,
      success: 'تم تقديم طلبك بنجاح! سيتم مراجعته من قبل الإدارة وسيتم إبلاغك بالقرار.',
      formData: {},
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
