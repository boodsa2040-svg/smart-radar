// =============================================
// Qayed - Chat Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/chat/unread/count
router.get('/unread/count', authenticate, async (req, res) => {
  try {
    const result = await get(
      `SELECT COUNT(*) as count FROM messages m
       JOIN trade_requests tr ON m.trade_request_id = tr.id
       WHERE (tr.requester_id = $1 OR tr.requestee_id = $1)
         AND m.sender_id != $1 AND m.is_read = 0`,
      [req.user.id]
    );
    res.json({ success: true, data: { unread: parseInt(result?.count || 0) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/chat/conversations
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const conversations = await all(
      `SELECT
         tr.id as trade_request_id,
         tr.status as trade_status,
         oi.title as offered_title,
         oi.image_urls as offered_images,
         wi.title as wanted_title,
         wi.image_urls as wanted_images,
         CASE WHEN tr.requester_id = $1 THEN ree.name ELSE req.name END as other_name,
         CASE WHEN tr.requester_id = $1 THEN ree.id   ELSE req.id   END as other_id,
         last_msg.content as last_message,
         last_msg.created_at as last_message_at,
         (SELECT COUNT(*) FROM messages m2
          WHERE m2.trade_request_id = tr.id AND m2.sender_id != $1 AND m2.is_read = 0) as unread_count
       FROM trade_requests tr
       JOIN items oi ON tr.offered_item_id = oi.id
       JOIN items wi ON tr.wanted_item_id  = wi.id
       JOIN users req ON tr.requester_id   = req.id
       JOIN users ree ON tr.requestee_id   = ree.id
       LEFT JOIN LATERAL (
         SELECT content, created_at FROM messages
         WHERE trade_request_id = tr.id
         ORDER BY created_at DESC LIMIT 1
       ) last_msg ON TRUE
       WHERE (tr.requester_id = $1 OR tr.requestee_id = $1)
         AND tr.status IN ('pending','accepted')
       ORDER BY COALESCE(last_msg.created_at, tr.created_at) DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: conversations });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/chat/:tradeRequestId/messages
router.get('/:tradeRequestId/messages', authenticate, async (req, res) => {
  try {
    const tr = await get(
      `SELECT * FROM trade_requests WHERE id = $1 AND (requester_id = $2 OR requestee_id = $2)`,
      [req.params.tradeRequestId, req.user.id]
    );
    if (!tr) return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });

    const messages = await all(
      `SELECT m.*, u.name as sender_name FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.trade_request_id = $1 ORDER BY m.created_at ASC`,
      [req.params.tradeRequestId]
    );

    // Mark as read (fire & forget)
    run(`UPDATE messages SET is_read = 1 WHERE trade_request_id = $1 AND sender_id != $2 AND is_read = 0`,
      [req.params.tradeRequestId, req.user.id]).catch(() => {});

    res.json({ success: true, data: messages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/chat/:tradeRequestId/messages
router.post('/:tradeRequestId/messages', authenticate, async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'يرجى كتابة رسالة' });

    const tr = await get(
      `SELECT * FROM trade_requests WHERE id = $1 AND (requester_id = $2 OR requestee_id = $2)`,
      [req.params.tradeRequestId, req.user.id]
    );
    if (!tr) return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });

    const message = await get(
      `INSERT INTO messages (trade_request_id, sender_id, content, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *, (SELECT name FROM users WHERE id = $2) as sender_name`,
      [req.params.tradeRequestId, req.user.id, content, type]
    );

    const otherId = tr.requester_id === req.user.id ? tr.requestee_id : tr.requester_id;
    // Notify other party (fire & forget)
    run(
      `INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES ($1, $2, $3, 'message', $4)`,
      [otherId, '💬 رسالة جديدة', `${req.user.name}: ${content.substring(0, 50)}`, req.params.tradeRequestId]
    ).catch(() => {});

    if (req.app.get('io')) {
      req.app.get('io').to(`trade_${req.params.tradeRequestId}`).emit('new_message', message);
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
