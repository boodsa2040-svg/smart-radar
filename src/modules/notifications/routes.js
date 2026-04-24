// =============================================
// Qayed - Notifications Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/notifications
router.get('/', authenticate, (req, res) => {
  try {
    const notifications = all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const unread = get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({
      success: true,
      data: {
        notifications,
        unread_count: unread ? unread.count : 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', authenticate, (req, res) => {
  try {
    run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ success: true, message: 'تم تحديث جميع الإشعارات كمقروءة' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, (req, res) => {
  try {
    run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'تم تحديث الإشعار' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/notifications/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'تم حذف الإشعار' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
