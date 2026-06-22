/**
 * Wholesale customer authentication middleware
 * - JWT-based session for wholesale customers
 * - Separate from admin auth (different cookie name)
 */

const jwt = require('jsonwebtoken');

const WHOLESALE_COOKIE = 'tz_wholesale_token';
const TOKEN_TTL = '30d'; // 30 days for wholesale customers

function getSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    return process.env.JWT_SECRET;
  }
  if (this._secret) return this._secret;
  this._secret = require('crypto').randomBytes(48).toString('base64');
  return this._secret;
}

function issueToken(username) {
  return jwt.sign({ username, role: 'wholesale' }, getSecret(), { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

function setAuthCookie(res, token) {
  res.cookie(WHOLESALE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(WHOLESALE_COOKIE, { path: '/' });
}

/**
 * Attach wholesale user info to res.locals (no blocking)
 */
function attachWholesaleToViews(req, res, next) {
  const token = req.cookies[WHOLESALE_COOKIE];
  const payload = token ? verifyToken(token) : null;
  res.locals.isWholesale = !!(payload && payload.role === 'wholesale');
  res.locals.wholesaleUsername = payload?.username || null;
  next();
}

module.exports = {
  WHOLESALE_COOKIE,
  issueToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  attachWholesaleToViews,
};
