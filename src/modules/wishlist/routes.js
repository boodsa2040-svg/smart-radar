// =============================================
// Qayed - Wishlist/Favorites Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/wishlist
router.get('/', authenticate, async (req, res) => {
  try {
    const items = await all(
      `SELECT w.id as wishlist_id, w.created_at as added_at,
              i.*, u.name as owner_name, u.trust_score as owner_trust
       FROM wishlist w
       JOIN items i ON w.item_id = i.id
       JOIN users u ON i.user_id = u.id
       WHERE w.user_id = $1 AND i.status = 'active'
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/wishlist
router.post('/', authenticate, async (req, res) => {
  try {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ success: false, error: 'يرجى تحديد المنتج' });

    const item = await get('SELECT id FROM items WHERE id = $1 AND status = $2', [item_id, 'active']);
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

    // ON CONFLICT DO NOTHING handles duplicates gracefully
    const result = await get(
      `INSERT INTO wishlist (user_id, item_id) VALUES ($1, $2)
       ON CONFLICT (user_id, item_id) DO NOTHING
       RETURNING id`,
      [req.user.id, item_id]
    );

    if (!result) return res.status(409).json({ success: false, error: 'المنتج موجود في المفضلة' });
    res.status(201).json({ success: true, message: 'تمت الإضافة للمفضلة ⭐', data: { id: result.id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/wishlist/:itemId
router.delete('/:itemId', authenticate, async (req, res) => {
  try {
    await run(`DELETE FROM wishlist WHERE user_id = $1 AND item_id = $2`, [req.user.id, req.params.itemId]);
    res.json({ success: true, message: 'تمت الإزالة من المفضلة' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/wishlist/check/:itemId
router.get('/check/:itemId', authenticate, async (req, res) => {
  try {
    const exists = await get(
      'SELECT id FROM wishlist WHERE user_id = $1 AND item_id = $2',
      [req.user.id, req.params.itemId]
    );
    res.json({ success: true, data: { is_wishlisted: !!exists } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
