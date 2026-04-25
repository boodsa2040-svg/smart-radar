// =============================================
// Qayed - Authentication Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { phone, name, password, email, city } = req.body;
    if (!name || (!phone && !email) || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال الجوال أو الإيميل مع الاسم وكلمة المرور' });
    }

    // Check duplicates
    if (phone) {
      const existingPhone = await get('SELECT id FROM users WHERE phone = $1', [phone]);
      if (existingPhone) return res.status(409).json({ success: false, error: 'رقم الجوال مسجّل مسبقاً' });
    }
    if (email) {
      const existingEmail = await get('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail) return res.status(409).json({ success: false, error: 'البريد الإلكتروني مسجّل مسبقاً' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await get(
      `INSERT INTO users (phone, name, email, password_hash, city)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, phone, name, email, city, trust_score, created_at`,
      [phone || null, name, email || null, password_hash, city || '']
    );

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    // Generate & log OTP (for phone verification)
    if (phone) {
      const otp = generateOTP();
      await run(
        `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
        [phone, otp, new Date(Date.now() + 5 * 60 * 1000).toISOString()]
      );
      console.log(`📱 OTP for ${phone}: ${otp}`);
    }

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح 🎉',
      data: { user, token }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال الجوال أو الإيميل وكلمة المرور' });
    }

    const user = await get(
      `SELECT * FROM users WHERE phone = $1 OR email = $1`,
      [loginId]
    );
    if (!user) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    const { password_hash, ...userData } = user;
    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح ✅', data: { user: userData, token } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الجوال' });

    const otp = generateOTP();
    await run(
      `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
      [phone, otp, new Date(Date.now() + 5 * 60 * 1000).toISOString()]
    );
    console.log(`📱 OTP for ${phone}: ${otp}`);

    res.json({
      success: true,
      message: 'تم إرسال رمز التحقق',
      data: {
        phone,
        expires_in: 300,
        dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الجوال ورمز التحقق' });

    const otp = await get(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND code = $2 AND is_used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    );

    if (!otp) return res.status(400).json({ success: false, error: 'رمز التحقق غير صحيح أو منتهي الصلاحية' });

    await run(`UPDATE otp_codes SET is_used = 1 WHERE id = $1`, [otp.id]);
    await run(`UPDATE users SET is_verified = 1 WHERE phone = $1`, [phone]);

    res.json({ success: true, message: 'تم التحقق بنجاح ✅' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await get(
      `SELECT id, phone, name, email, avatar_url, bio, city, is_verified,
              trust_score, total_trades, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
