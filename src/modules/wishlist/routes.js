// =============================================
// Qayed - Wishlist/Favorites Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/wishlist
router.get('/', authenticate, (req, res) => {
  try {
    const items = all(
      `SELECT w.id as wishlist_id, w.created_at as added_at, i.*, u.name as owner_name, u.trust_score as owner_trust
       FROM wishlist w JOIN items i ON w.item_id = i.id JOIN users u ON i.user_id = u.id
       WHERE w.user_id = ? ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    items.forEach(i => {
      i.image_urls = JSON.parse(i.image_urls || '[]');
      i.ai_analysis = JSON.parse(i.ai_analysis || '{}');
    });
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/wishlist
router.post('/', authenticate, (req, res) => {
  try {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ success: false, error: 'يرجى تحديد المنتج' });

    const item = get('SELECT * FROM items WHERE id = ?', [item_id]);
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

    const existing = get('SELECT id FROM wishlist WHERE user_id = ? AND item_id = ?', [req.user.id, item_id]);
    if (existing) return res.status(409).json({ success: false, error: 'المنتج موجود في المفضلة' });

    const id = uuidv4();
    run('INSERT INTO wishlist (id, user_id, item_id) VALUES (?, ?, ?)', [id, req.user.id, item_id]);
    res.status(201).json({ success: true, message: 'تمت الإضافة للمفضلة ⭐', data: { id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/wishlist/:itemId
router.delete('/:itemId', authenticate, (req, res) => {
  try {
    run('DELETE FROM wishlist WHERE user_id = ? AND item_id = ?', [req.user.id, req.params.itemId]);
    res.json({ success: true, message: 'تمت الإزالة من المفضلة' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/wishlist/check/:itemId
router.get('/check/:itemId', authenticate, (req, res) => {
  try {
    const exists = get('SELECT id FROM wishlist WHERE user_id = ? AND item_id = ?', [req.user.id, req.params.itemId]);
    res.json({ success: true, data: { is_wishlisted: !!exists } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
