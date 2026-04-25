// =============================================
// Qayed - Admin Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');

// GET /api/v1/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [users, items, trades, completed] = await Promise.all([
      get('SELECT COUNT(*) as c FROM users'),
      get('SELECT COUNT(*) as c FROM items WHERE status = $1', ['active']),
      get('SELECT COUNT(*) as c FROM trade_requests'),
      get('SELECT COUNT(*) as c FROM trades WHERE status = $1', ['completed']),
    ]);
    res.json({
      success: true,
      data: {
        users:     parseInt(users?.c || 0),
        items:     parseInt(items?.c || 0),
        trades:    parseInt(trades?.c || 0),
        completed: parseInt(completed?.c || 0),
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await all(
      `SELECT u.*,
              (SELECT COUNT(*) FROM items WHERE user_id = u.id) as items_count,
              (SELECT COUNT(*) FROM trade_requests WHERE requester_id = u.id OR requestee_id = u.id) as trades_count
       FROM users u ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/admin/items
router.get('/items', async (req, res) => {
  try {
    const items = await all(
      `SELECT i.*, u.name as owner_name FROM items i
       LEFT JOIN users u ON i.user_id = u.id
       ORDER BY i.created_at DESC`
    );
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/admin/trades
router.get('/trades', async (req, res) => {
  try {
    const trades = await all(
      `SELECT tr.*,
              i1.title as offered_item_title, i2.title as wanted_item_title,
              u1.name as requester_name, u2.name as receiver_name
       FROM trade_requests tr
       LEFT JOIN items i1 ON tr.offered_item_id = i1.id
       LEFT JOIN items i2 ON tr.wanted_item_id  = i2.id
       LEFT JOIN users u1 ON tr.requester_id    = u1.id
       LEFT JOIN users u2 ON tr.requestee_id    = u2.id
       ORDER BY tr.created_at DESC`
    );
    res.json({ success: true, data: trades });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    // CASCADE handles items + related records via FK constraints
    await run('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف المستخدم وجميع بياناته بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/admin/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await run('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/v1/admin/items/:id
router.put('/items/:id', async (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, city } = req.body;
    await run(
      `UPDATE items SET title=$1, description=$2, category=$3, condition=$4,
       estimated_value=$5, city=$6, updated_at=NOW() WHERE id=$7`,
      [title, description, category, condition, estimated_value, city, req.params.id]
    );
    res.json({ success: true, message: 'تم التعديل بنجاح ✅' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
