// =============================================
// Qayed - Chat Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/chat/unread/count
router.get('/unread/count', authenticate, (req, res) => {
  try {
    const result = get(`SELECT COUNT(*) as count FROM messages m JOIN trade_requests tr ON m.trade_request_id=tr.id WHERE (tr.requester_id=? OR tr.requestee_id=?) AND m.sender_id!=? AND m.is_read=0`, [req.user.id, req.user.id, req.user.id]);
    res.json({ success: true, data: { unread: result ? result.count : 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/chat/conversations
router.get('/conversations', authenticate, (req, res) => {
  try {
    const trs = all(`SELECT tr.id as trade_request_id, tr.status as trade_status, oi.title as offered_title, oi.image_urls as offered_images, wi.title as wanted_title, wi.image_urls as wanted_images,
      CASE WHEN tr.requester_id=? THEN ree.name ELSE req.name END as other_name,
      CASE WHEN tr.requester_id=? THEN ree.id ELSE req.id END as other_id
      FROM trade_requests tr JOIN items oi ON tr.offered_item_id=oi.id JOIN items wi ON tr.wanted_item_id=wi.id JOIN users req ON tr.requester_id=req.id JOIN users ree ON tr.requestee_id=ree.id
      WHERE (tr.requester_id=? OR tr.requestee_id=?) AND tr.status IN ('pending','accepted') ORDER BY tr.created_at DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]);

    trs.forEach(c => {
      c.offered_images = JSON.parse(c.offered_images||'[]');
      c.wanted_images = JSON.parse(c.wanted_images||'[]');
      const lastMsg = get('SELECT content, created_at FROM messages WHERE trade_request_id=? ORDER BY created_at DESC LIMIT 1', [c.trade_request_id]);
      c.last_message = lastMsg ? lastMsg.content : null;
      c.last_message_at = lastMsg ? lastMsg.created_at : null;
      const unread = get('SELECT COUNT(*) as count FROM messages WHERE trade_request_id=? AND sender_id!=? AND is_read=0', [c.trade_request_id, req.user.id]);
      c.unread_count = unread ? unread.count : 0;
    });

    res.json({ success: true, data: trs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/chat/:tradeRequestId/messages
router.get('/:tradeRequestId/messages', authenticate, (req, res) => {
  try {
    const tr = get('SELECT * FROM trade_requests WHERE id=? AND (requester_id=? OR requestee_id=?)', [req.params.tradeRequestId, req.user.id, req.user.id]);
    if (!tr) return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });

    const messages = all('SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.trade_request_id=? ORDER BY m.created_at ASC', [req.params.tradeRequestId]);
    run('UPDATE messages SET is_read=1 WHERE trade_request_id=? AND sender_id!=? AND is_read=0', [req.params.tradeRequestId, req.user.id]);

    res.json({ success: true, data: messages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/chat/:tradeRequestId/messages
router.post('/:tradeRequestId/messages', authenticate, (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'يرجى كتابة رسالة' });

    const tr = get('SELECT * FROM trade_requests WHERE id=? AND (requester_id=? OR requestee_id=?)', [req.params.tradeRequestId, req.user.id, req.user.id]);
    if (!tr) return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });

    const id = uuidv4();
    run('INSERT INTO messages (id,trade_request_id,sender_id,content,type) VALUES (?,?,?,?,?)',
      [id, req.params.tradeRequestId, req.user.id, content, type]);

    const message = get('SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?', [id]);

    const otherId = tr.requester_id===req.user.id ? tr.requestee_id : tr.requester_id;
    run('INSERT INTO notifications (id,user_id,title,body,type,reference_id) VALUES (?,?,?,?,?,?)',
      [uuidv4(), otherId, '💬 رسالة جديدة', `${req.user.name}: ${content.substring(0,50)}`, 'message', req.params.tradeRequestId]);

    if (req.app.get('io')) {
      req.app.get('io').to(`trade_${req.params.tradeRequestId}`).emit('new_message', message);
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
