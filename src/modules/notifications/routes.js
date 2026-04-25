// =============================================
// Qayed - Notifications Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const [notifications, unread] = await Promise.all([
      all(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user.id]
      ),
      get(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 0`,
        [req.user.id]
      ),
    ]);
    res.json({
      success: true,
      data: { notifications, unread_count: parseInt(unread?.count || 0) }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await run(`UPDATE notifications SET is_read = 1 WHERE user_id = $1 AND is_read = 0`, [req.user.id]);
    res.json({ success: true, message: 'تم تحديث جميع الإشعارات كمقروءة' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await run(`UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    res.json({ success: true, message: 'تم تحديث الإشعار' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/notifications/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await run(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    res.json({ success: true, message: 'تم حذف الإشعار' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
