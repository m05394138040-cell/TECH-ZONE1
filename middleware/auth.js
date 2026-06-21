/**
 * Authentication middleware
 * - Issues JWT cookies on successful login
 * - Verifies JWT on protected routes
 * - Tokens last 7 days
 * - Auto-generates JWT_SECRET if not set (with warning)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TOKEN_COOKIE = 'tz_admin_token';
const TOKEN_TTL = '7d';

let _secret = null;
let _warnedAboutDefault = false;

function getSecret() {
  // Priority 1: env var (production-ready)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    return process.env.JWT_SECRET;
  }
  // Priority 2: cached random secret for this process
  if (_secret) return _secret;
  // Priority 3: generate a random one (will reset on each deploy — that's fine for our use case)
  _secret = crypto.randomBytes(48).toString('base64');
  if (!_warnedAboutDefault) {
    console.log('⚠️  JWT_SECRET not set in env — generated a random one for this session.');
    console.log('   For multi-instance deployments, set JWT_SECRET in env vars.');
    _warnedAboutDefault = true;
  }
  return _secret;
}

/**
 * Issue a signed token for the given username
 */
function issueToken(username) {
  return jwt.sign({ username, role: 'admin' }, getSecret(), { expiresIn: TOKEN_TTL });
}

/**
 * Verify a token string; returns payload or null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/**
 * Set the auth cookie on the response
 */
function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Clear the auth cookie
 */
function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
}

/**
 * Express middleware: require admin login.
 * If unauthenticated, redirect to /admin/login (for HTML) or 401 (for JSON).
 */
function requireAdmin(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  const payload = token ? verifyToken(token) : null;

  if (!payload || payload.role !== 'admin') {
    if (req.accepts('html')) {
      return res.redirect('/admin/login');
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.admin = payload;
  next();
}

/**
 * Optional: pass admin status to views (without blocking)
 */
function attachAdminToViews(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  const payload = token ? verifyToken(token) : null;
  res.locals.isAdmin = !!(payload && payload.role === 'admin');
  res.locals.adminUsername = payload?.username || null;
  next();
}

module.exports = {
  TOKEN_COOKIE,
  issueToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdmin,
  attachAdminToViews,
};