// =============================================
// Qayed - Users Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

// GET /api/v1/users/me
router.get('/me', authenticate, (req, res) => {
  try {
    const user = get('SELECT id,phone,name,email,avatar_url,bio,latitude,longitude,city,is_verified,trust_score,total_trades,created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    const count = get('SELECT COUNT(*) as count FROM items WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, data: { ...user, items_count: count ? count.count : 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/v1/users/me
router.put('/me', authenticate, (req, res) => {
  try {
    const { name, email, bio, city } = req.body;
    const u = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    run('UPDATE users SET name=?, email=?, bio=?, city=?, updated_at=datetime(\'now\') WHERE id=?',
      [name || u.name, email || u.email, bio || u.bio, city || u.city, req.user.id]);
    const user = get('SELECT id,phone,name,email,avatar_url,bio,city,is_verified,trust_score FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: 'تم تحديث البيانات بنجاح', data: user });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/users/me/location
router.patch('/me/location', authenticate, (req, res) => {
  try {
    const { latitude, longitude, city } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ success: false, error: 'يرجى إرسال إحداثيات الموقع' });
    run('UPDATE users SET latitude=?, longitude=?, city=?, updated_at=datetime(\'now\') WHERE id=?',
      [latitude, longitude, city || '', req.user.id]);
    res.json({ success: true, message: 'تم تحديث الموقع بنجاح', data: { latitude, longitude, city } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/users/me/avatar
router.post('/me/avatar', authenticate, upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'يرجى اختيار صورة' });
    const avatar_url = `/uploads/${req.file.filename}`;
    run('UPDATE users SET avatar_url=?, updated_at=datetime(\'now\') WHERE id=?', [avatar_url, req.user.id]);
    res.json({ success: true, message: 'تم تحديث الصورة الشخصية', data: { avatar_url } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/users/:id
router.get('/:id', (req, res) => {
  try {
    const user = get('SELECT id,name,avatar_url,bio,city,is_verified,trust_score,total_trades,created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    const reviews = all('SELECT r.*, u.name as reviewer_name FROM reviews r JOIN users u ON r.reviewer_id = u.id WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 10', [req.params.id]);
    const items = all('SELECT id,title,category,condition,estimated_value,image_urls,created_at FROM items WHERE user_id = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 20', [req.params.id]);
    items.forEach(i => { i.image_urls = JSON.parse(i.image_urls || '[]'); });
    res.json({ success: true, data: { ...user, reviews, items } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
