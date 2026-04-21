// =============================================
// Qayed - JWT Authentication Middleware
// =============================================
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح - يرجى تسجيل الدخول',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'انتهت صلاحية الجلسة - يرجى تسجيل الدخول مجدداً',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'توكن غير صالح',
      code: 'INVALID_TOKEN'
    });
  }
}

// Optional auth - doesn't block if no token
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    }
  } catch (e) {
    // Ignore token errors for optional auth
  }
  next();
}

module.exports = { authenticate, optionalAuth };
