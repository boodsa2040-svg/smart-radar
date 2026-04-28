// =============================================
// Qayed - Admin Routes (PostgreSQL)
// Full System Integration
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');

// ── GET /api/v1/admin/stats ── Full system statistics
router.get('/stats', async (req, res) => {
  try {
    const [users, items, tradeReqs, completed, messages, notifications, reviews] = await Promise.all([
      get('SELECT COUNT(*) as c FROM users'),
      get('SELECT COUNT(*) as c FROM items WHERE status = $1', ['active']),
      get('SELECT COUNT(*) as c FROM trade_requests'),
      get('SELECT COUNT(*) as c FROM trades WHERE status = $1', ['completed']),
      get('SELECT COUNT(*) as c FROM messages'),
      get('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0'),
      get('SELECT COUNT(*) as c FROM reviews'),
    ]);
    res.json({
      success: true,
      data: {
        users:          parseInt(users?.c || 0),
        items:          parseInt(items?.c || 0),
        trades:         parseInt(tradeReqs?.c || 0),
        completed:      parseInt(completed?.c || 0),
        messages:       parseInt(messages?.c || 0),
        notifications:  parseInt(notifications?.c || 0),
        reviews:        parseInt(reviews?.c || 0),
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/v1/admin/users ── All users with counts
router.get('/users', async (req, res) => {
  try {
    const users = await all(
      `SELECT u.*,
              (SELECT COUNT(*) FROM items WHERE user_id = u.id) as items_count,
              (SELECT COUNT(*) FROM trade_requests WHERE requester_id = u.id OR requestee_id = u.id) as trades_count,
              (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.id) as reviews_count
       FROM users u ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/v1/admin/items ── All items with owner
router.get('/items', async (req, res) => {
  try {
    const items = await all(
      `SELECT i.*, u.name as owner_name, u.phone as owner_phone FROM items i
       LEFT JOIN users u ON i.user_id = u.id
       ORDER BY i.created_at DESC`
    );
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/v1/admin/trades ── All trade requests with details
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

// ── GET /api/v1/admin/messages ── All messages across the platform
router.get('/messages', async (req, res) => {
  try {
    const messages = await all(
      `SELECT m.*,
              u.name as sender_name,
              tr.status as trade_status,
              oi.title as offered_title,
              wi.title as wanted_title
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       JOIN trade_requests tr ON m.trade_request_id = tr.id
       LEFT JOIN items oi ON tr.offered_item_id = oi.id
       LEFT JOIN items wi ON tr.wanted_item_id  = wi.id
       ORDER BY m.created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: messages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/v1/admin/reviews ── All reviews across the platform
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await all(
      `SELECT r.*,
              reviewer.name as reviewer_name,
              reviewee.name as reviewee_name
       FROM reviews r
       JOIN users reviewer ON r.reviewer_id = reviewer.id
       JOIN users reviewee ON r.reviewee_id = reviewee.id
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: reviews });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/v1/admin/broadcast ── Send notification to ALL users
router.post('/broadcast', async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان الإشعار' });

    const users = await all('SELECT id FROM users');
    let sent = 0;
    for (const u of users) {
      await run(
        `INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, 'admin')`,
        [u.id, title, body || '']
      );
      sent++;
    }
    // Emit via Socket.io if available
    if (req.app.get('io')) {
      req.app.get('io').emit('admin_broadcast', { title, body });
    }
    res.json({ success: true, message: `تم إرسال الإشعار لـ ${sent} مستخدم ✅` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/v1/admin/notify/:userId ── Send notification to specific user
router.post('/notify/:userId', async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان الإشعار' });

    await run(
      `INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, 'admin')`,
      [req.params.userId, title, body || '']
    );
    if (req.app.get('io')) {
      req.app.get('io').to(`user_${req.params.userId}`).emit('new_notification', { title, body });
    }
    res.json({ success: true, message: 'تم إرسال الإشعار بنجاح ✅' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/v1/admin/users/:id ── Delete user + CASCADE
router.delete('/users/:id', async (req, res) => {
  try {
    await run('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف المستخدم وجميع بياناته بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/v1/admin/items/:id ── Delete item
router.delete('/items/:id', async (req, res) => {
  try {
    await run('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/v1/admin/trades/:id ── Delete trade request
router.delete('/trades/:id', async (req, res) => {
  try {
    await run('DELETE FROM trade_requests WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف طلب المقايضة بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/v1/admin/reviews/:id ── Delete a review
router.delete('/reviews/:id', async (req, res) => {
  try {
    await run('DELETE FROM reviews WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /api/v1/admin/items/:id ── Edit item
router.put('/items/:id', async (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, city, status } = req.body;
    await run(
      `UPDATE items SET title=$1, description=$2, category=$3, condition=$4,
       estimated_value=$5, city=$6, status=COALESCE($7, status), updated_at=NOW() WHERE id=$8`,
      [title, description, category, condition, estimated_value, city, status || null, req.params.id]
    );
    res.json({ success: true, message: 'تم التعديل بنجاح ✅' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /api/v1/admin/users/:id ── Edit user profile
router.put('/users/:id', async (req, res) => {
  try {
    const { name, phone, city, trust_score, is_verified } = req.body;
    await run(
      `UPDATE users SET name=COALESCE($1, name), phone=COALESCE($2, phone),
       city=COALESCE($3, city), trust_score=COALESCE($4, trust_score),
       is_verified=COALESCE($5, is_verified), updated_at=NOW() WHERE id=$6`,
      [name, phone, city, trust_score, is_verified, req.params.id]
    );
    res.json({ success: true, message: 'تم تعديل بيانات المستخدم بنجاح ✅' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/v1/items/categories/list ──
router.get('/categories/list', async (req, res) => {
  try {
    const cats = await all('SELECT * FROM categories WHERE is_active = 1 ORDER BY label ASC');
    res.json({ success: true, data: cats });
  } catch (err) {
    // Fallback if table doesn't exist yet or error
    res.json({ success: true, data: [
      { name: 'electronics', label: 'إلكترونيات', icon: 'phone-portrait-outline', color: '#00BFA6' },
      { name: 'fashion', label: 'أزياء', icon: 'shirt-outline', color: '#6366F1' },
      { name: 'other', label: 'أخرى', icon: 'apps-outline', color: '#6B7280' }
    ]});
  }
});

// ── GET /api/v1/admin/categories ── All categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await all('SELECT * FROM categories ORDER BY created_at DESC');
    res.json({ success: true, data: cats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/v1/admin/categories ── Add new category
router.post('/categories', async (req, res) => {
  try {
    const { name, label, icon, color } = req.body;
    if (!name || !label) return res.status(400).json({ success: false, error: 'يرجى إدخال اسم وتسمية الفئة' });
    const cat = await get(
      'INSERT INTO categories (name, label, icon, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, label, icon || 'apps-outline', color || '#6366F1']
    );
    res.json({ success: true, message: 'تم إضافة الفئة بنجاح ✅', data: cat });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/v1/admin/categories/:id ── Delete category
router.delete('/categories/:id', async (req, res) => {
  try {
    await run('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم حذف الفئة بنجاح' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
