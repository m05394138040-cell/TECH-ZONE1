/**
 * Bot management routes
 *  GET  /admin/bot             - bot dashboard (QR + status)
 *  POST /admin/bot/logout      - logout the bot
 *  POST /admin/bot/test        - send a test WhatsApp message
 *  GET  /api/bot/status        - JSON status (for polling)
 */

const express = require('express');
const router = express.Router();
const bot = require('../bot/whatsapp-bot');
const { query, queryAll } = require('../config/db');

function requireAdmin(req, res, next) {
  if (res.locals && res.locals.isAdmin) return next();
  return res.redirect('/admin/login');
}

router.get('/admin/bot', requireAdmin, async (req, res, next) => {
  try {
    const status = bot.getStatus();
    // Get bot config from settings
    const cfg = await queryAll(
      "SELECT key, value FROM settings WHERE key IN ('bot_name', 'bot_enabled', 'whatsapp_business_number')"
    );
    const config = {};
    cfg.forEach(r => { config[r.key] = r.value; });
    res.render('admin/bot', {
      title: 'بوت WhatsApp',
      status,
      config,
      error: null,
      success: null,
      active: 'bot',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/bot/logout', requireAdmin, async (req, res, next) => {
  try {
    await bot.logout();
    res.redirect('/admin/bot?logged_out=1');
  } catch (err) {
    next(err);
  }
});

router.post('/admin/bot/test', requireAdmin, async (req, res, next) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      const status = bot.getStatus();
      return res.render('admin/bot', {
        title: 'بوت WhatsApp',
        status,
        config: {},
        error: 'رقم الهاتف والرسالة مطلوبان',
        success: null,
        active: 'bot',
      });
    }
    const result = await bot.sendMessage(phone, message);
    const status = bot.getStatus();
    res.render('admin/bot', {
      title: 'بوت WhatsApp',
      status,
      config: {},
      error: result.ok ? null : 'فشل الإرسال: ' + result.error,
      success: result.ok ? `✅ تم إرسال الرسالة التجريبية إلى ${phone}` : null,
      active: 'bot',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/bot/status', (req, res) => {
  res.json(bot.getStatus());
});

module.exports = router;
