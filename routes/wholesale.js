/**
 * Wholesale customer routes
 *  POST /wholesale-login  - login
 *  GET  /wholesale-logout - logout
 *  GET  /wholesale-info   - current user info (JSON)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { queryOne } = require('../config/db');
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
  res.render('wholesale-login', { title: 'دخول تجار الجملة', error: null, success: null });
});

// Handle login
router.post('/wholesale-login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.render('wholesale-login', {
        title: 'دخول تجار الجملة',
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
        title: 'دخول تجار الجملة',
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        success: null,
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render('wholesale-login', {
        title: 'دخول تجار الجملة',
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

module.exports = router;
