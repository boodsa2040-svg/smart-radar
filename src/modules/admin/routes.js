const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');

// Admin GET APIs
router.get('/stats', (req, res) => {
  try {
    const usersCount = get("SELECT COUNT(*) as c FROM users").c;
    const itemsCount = get("SELECT COUNT(*) as c FROM items").c;
    const tradesCount = get("SELECT COUNT(*) as c FROM trade_requests").c;
    res.json({ success: true, data: { users: usersCount, items: itemsCount, trades: tradesCount } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/users', (req, res) => {
  try {
    const users = all("SELECT id, name, phone, email, city, trust_score, created_at, (SELECT COUNT(*) FROM items WHERE user_id = users.id) as items_count FROM users ORDER BY created_at DESC");
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/items', (req, res) => {
  try {
    const items = all("SELECT i.*, u.name as owner_name FROM items i LEFT JOIN users u ON i.user_id = u.id ORDER BY i.created_at DESC");
    res.json({ success: true, data: items || [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/trades', (req, res) => {
  try {
    const trades = all(`
      SELECT tr.*, 
        i1.title as offered_item_title, i2.title as wanted_item_title,
        u1.name as requester_name, u2.name as receiver_name
      FROM trade_requests tr
      LEFT JOIN items i1 ON tr.offered_item_id = i1.id
      LEFT JOIN items i2 ON tr.wanted_item_id = i2.id
      LEFT JOIN users u1 ON tr.requester_id = u1.id
      LEFT JOIN users u2 ON tr.receiver_id = u2.id
      ORDER BY tr.created_at DESC
    `);
    res.json({ success: true, data: trades || [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin ACTIONS
router.delete('/users/:id', (req, res) => {
  try {
    run("DELETE FROM users WHERE id = ?", [req.params.id]);
    run("DELETE FROM items WHERE user_id = ?", [req.params.id]);
    res.json({ success: true, message: 'تم حذف المستخدم وحسابه وكل منتجاته بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/items/:id', (req, res) => {
  try {
    run("DELETE FROM items WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/items/:id', (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, city } = req.body;
    run("UPDATE items SET title=?, description=?, category=?, condition=?, estimated_value=?, city=? WHERE id=?", 
      [title, description, category, condition, estimated_value, city, req.params.id]);
    res.json({ success: true, message: 'تم التعديل بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
