// =============================================
// Qayed - Users Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

// GET /api/v1/users/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [user, countRow] = await Promise.all([
      get(
        `SELECT id,phone,name,email,avatar_url,bio,latitude,longitude,city,
                is_verified,trust_score,total_trades,created_at
         FROM users WHERE id = $1`,
        [req.user.id]
      ),
      get('SELECT COUNT(*) as count FROM items WHERE user_id = $1 AND status = $2', [req.user.id, 'active']),
    ]);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    res.json({ success: true, data: { ...user, items_count: parseInt(countRow?.count || 0) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/v1/users/me
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, email, bio, city } = req.body;
    const user = await get(
      `UPDATE users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         bio = COALESCE($3, bio),
         city = COALESCE($4, city),
         updated_at = NOW()
       WHERE id = $5
       RETURNING id, phone, name, email, avatar_url, bio, city, is_verified, trust_score, total_trades`,
      [name || null, email || null, bio || null, city || null, req.user.id]
    );
    res.json({ success: true, message: 'تم تحديث البيانات بنجاح ✅', data: user });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/users/me/location
router.patch('/me/location', authenticate, async (req, res) => {
  try {
    const { latitude, longitude, city } = req.body;
    if (latitude == null || longitude == null)
      return res.status(400).json({ success: false, error: 'يرجى إرسال إحداثيات الموقع' });
    await run(
      `UPDATE users SET latitude = $1, longitude = $2, city = $3, updated_at = NOW() WHERE id = $4`,
      [latitude, longitude, city || '', req.user.id]
    );
    res.json({ success: true, message: 'تم تحديث الموقع بنجاح', data: { latitude, longitude, city } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/users/me/avatar
router.post('/me/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'يرجى اختيار صورة' });
    const avatar_url = `/uploads/${req.file.filename}`;
    await run(`UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`, [avatar_url, req.user.id]);
    res.json({ success: true, message: 'تم تحديث الصورة الشخصية', data: { avatar_url } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/users/:id
router.get('/:id', async (req, res) => {
  try {
    const [user, reviews, items] = await Promise.all([
      get(
        `SELECT id,name,avatar_url,bio,city,is_verified,trust_score,total_trades,created_at
         FROM users WHERE id = $1`,
        [req.params.id]
      ),
      all(
        `SELECT r.*, u.name as reviewer_name FROM reviews r
         JOIN users u ON r.reviewer_id = u.id
         WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
        [req.params.id]
      ),
      all(
        `SELECT id,title,category,condition,estimated_value,image_urls,created_at
         FROM items WHERE user_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      ),
    ]);

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    res.json({ success: true, data: { ...user, reviews, items } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
