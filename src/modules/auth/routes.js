// =============================================
// Qayed - Authentication Routes (sql.js)
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
    const { phone, name, password, email } = req.body;
    if (!name || (!phone && !email) || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال الجوال أو الإيميل مع الاسم وكلمة المرور' });
    }

    const existingName = get('SELECT id FROM users WHERE name = ?', [name]);
    if (existingName) {
      return res.status(409).json({ success: false, error: 'هذا الاسم مستخدم، الرجاء اختيار اسم آخر' });
    }

    if (phone) {
      const existingPhone = get('SELECT id FROM users WHERE phone = ?', [phone]);
      if (existingPhone) return res.status(409).json({ success: false, error: 'رقم الجوال مسجّل مسبقاً' });
    }

    if (email) {
      const existingEmail = get('SELECT id FROM users WHERE email = ?', [email]);
      if (existingEmail) return res.status(409).json({ success: false, error: 'البريد الإلكتروني مسجّل مسبقاً' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);
    run('INSERT INTO users (id, phone, name, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [id, phone, name, email || null, password_hash]);

    const token = jwt.sign({ id, phone, name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    const otp = generateOTP();
    run('INSERT INTO otp_codes (id, phone, code, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), phone, otp, new Date(Date.now() + 5 * 60 * 1000).toISOString()]);

    console.log(`📱 OTP for ${phone}: ${otp}`);

    res.status(201).json({
      success: true, message: 'تم إنشاء الحساب بنجاح',
      data: { user: { id, phone, name, email }, token, dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال الجوال أو الإيميل وكلمة المرور' });
    }

    const user = get('SELECT * FROM users WHERE phone = ? OR email = ?', [loginId, loginId]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, name: user.name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    const { password_hash, ...userData } = user;

    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', data: { user: userData, token } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/auth/send-otp
router.post('/send-otp', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الجوال' });

    const otp = generateOTP();
    run('INSERT INTO otp_codes (id, phone, code, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), phone, otp, new Date(Date.now() + 5 * 60 * 1000).toISOString()]);
    console.log(`📱 OTP for ${phone}: ${otp}`);

    res.json({
      success: true, message: 'تم إرسال رمز التحقق',
      data: { phone, expires_in: 300, dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الجوال ورمز التحقق' });

    const otp = get('SELECT * FROM otp_codes WHERE phone = ? AND code = ? AND is_used = 0 ORDER BY created_at DESC LIMIT 1', [phone, code]);
    if (!otp) return res.status(400).json({ success: false, error: 'رمز التحقق غير صحيح' });
    if (new Date(otp.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'انتهت صلاحية رمز التحقق' });

    run('UPDATE otp_codes SET is_used = 1 WHERE id = ?', [otp.id]);
    run('UPDATE users SET is_verified = 1 WHERE phone = ?', [phone]);

    res.json({ success: true, message: 'تم التحقق بنجاح ✅' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res) => {
  try {
    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    const { password_hash, ...userData } = user;
    res.json({ success: true, data: userData });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
