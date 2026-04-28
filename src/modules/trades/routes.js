// =============================================
// Qayed - Trades Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { sendSystemMessage } = require('../chat/routes');

// POST /api/v1/trades/request
router.post('/request', authenticate, async (req, res) => {
  try {
    const { offered_item_id, wanted_item_id, message } = req.body;
    if (!offered_item_id || !wanted_item_id)
      return res.status(400).json({ success: false, error: 'يرجى تحديد المنتجين' });

    const [offered, wanted] = await Promise.all([
      get(`SELECT * FROM items WHERE id = $1 AND user_id = $2 AND status = 'active'`, [offered_item_id, req.user.id]),
      get(`SELECT * FROM items WHERE id = $1 AND status = 'active'`, [wanted_item_id]),
    ]);

    if (!offered) return res.status(400).json({ success: false, error: 'المنتج المعروض غير موجود أو ليس ملكك' });
    if (!wanted)  return res.status(400).json({ success: false, error: 'المنتج المطلوب غير موجود' });
    if (wanted.user_id === req.user.id) return res.status(400).json({ success: false, error: 'لا يمكنك مقايضة مع نفسك' });

    const existing = await get(
      `SELECT id FROM trade_requests WHERE requester_id = $1 AND wanted_item_id = $2 AND status = 'pending'`,
      [req.user.id, wanted_item_id]
    );
    if (existing) return res.status(409).json({ success: false, error: 'يوجد طلب معلّق بالفعل' });

    const request = await get(
      `INSERT INTO trade_requests (requester_id, requestee_id, offered_item_id, wanted_item_id, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, wanted.user_id, offered_item_id, wanted_item_id, message || '']
    );

    // Notify requestee
    await run(
      `INSERT INTO notifications (user_id, title, body, type, reference_id)
       VALUES ($1, $2, $3, 'trade_request', $4)`,
      [wanted.user_id, '🔔 طلب مقايضة جديد',
       `${req.user.name} يريد مقايضة "${offered.title}" بـ "${wanted.title}"`,
       request.id]
    );

    if (req.app.get('io')) {
      req.app.get('io').to(`user_${wanted.user_id}`).emit('new_trade_request', { id: request.id, requester_name: req.user.name });
    }

    res.status(201).json({ success: true, message: 'تم إرسال طلب المقايضة ✅', data: { id: request.id, status: 'pending' } });
  } catch (err) {
    console.error('Trade request error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/trades/requests
router.get('/requests', authenticate, async (req, res) => {
  try {
    const { type = 'all', status } = req.query;
    const params = [req.user.id];
    let where = '';

    if (type === 'incoming')      { where = 'AND tr.requestee_id = $1'; }
    else if (type === 'outgoing') { where = 'AND tr.requester_id = $1'; }
    else                          { where = 'AND (tr.requester_id = $1 OR tr.requestee_id = $1)'; }

    let statusClause = '';
    if (status) { statusClause = `AND tr.status = $2`; params.push(status); }

    const requests = await all(
      `SELECT tr.*,
              oi.title as offered_title, oi.image_urls as offered_images,
              wi.title as wanted_title,  wi.image_urls as wanted_images,
              req.name as requester_name, req.trust_score as requester_trust,
              ree.name as requestee_name
       FROM trade_requests tr
       JOIN items oi ON tr.offered_item_id = oi.id
       JOIN items wi ON tr.wanted_item_id  = wi.id
       JOIN users req ON tr.requester_id   = req.id
       JOIN users ree ON tr.requestee_id   = ree.id
       WHERE 1=1 ${where} ${statusClause}
       ORDER BY tr.created_at DESC`,
      params
    );
    res.json({ success: true, data: requests });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/trades/requests/:id
router.patch('/requests/:id', authenticate, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['accept', 'reject'].includes(action))
      return res.status(400).json({ success: false, error: 'الإجراء غير صحيح' });

    const request = await get(
      `SELECT * FROM trade_requests WHERE id = $1 AND requestee_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!request) return res.status(404).json({ success: false, error: 'طلب المقايضة غير موجود' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, error: 'تم الرد مسبقاً' });

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await run(`UPDATE trade_requests SET status = $1, responded_at = NOW() WHERE id = $2`, [newStatus, req.params.id]);

    const io = req.app.get('io');

    if (action === 'accept') {
      const codeA = Math.floor(1000 + Math.random() * 9000).toString();
      const codeB = Math.floor(1000 + Math.random() * 9000).toString();

      const trade = await get(
        `INSERT INTO trades
           (request_id, item_a_id, item_b_id, user_a_id, user_b_id, user_a_code, user_b_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [request.id, request.offered_item_id, request.wanted_item_id,
         request.requester_id, request.requestee_id, codeA, codeB]
      );

      await Promise.all([
        run(`UPDATE items SET status = 'traded' WHERE id = ANY($1)`, [[request.offered_item_id, request.wanted_item_id]]),
        run(`UPDATE users SET total_trades = total_trades + 1 WHERE id = ANY($1)`, [[request.requester_id, request.requestee_id]]),
        run(
          `INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES ($1, $2, $3, 'trade_accepted', $4)`,
          [request.requester_id, '🎉 تم قبول المقايضة!', `${req.user.name} وافق! تواصلوا لإتمام الصفقة`, trade.id]
        ),
      ]);

      // Auto system message in chat
      sendSystemMessage(request.id, `✅ تم قبول طلب المقايضة بواسطة ${req.user.name}. تواصلوا لتحديد مكان التسليم!`, io).catch(() => {});

      if (io) {
        io.to(`user_${request.requester_id}`).emit('trade_status_changed', { id: request.id, status: newStatus });
      }
    } else {
      await run(
        `INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES ($1, $2, $3, 'trade_rejected', $4)`,
        [request.requester_id, '❌ تم رفض المقايضة', 'جرّب عروض أخرى!', request.id]
      );

      // Auto system message in chat
      sendSystemMessage(request.id, `❌ تم رفض طلب المقايضة. يمكنك تجربة عروض أخرى.`, io).catch(() => {});
    }

    res.json({ success: true, message: action === 'accept' ? 'تم قبول المقايضة 🎉' : 'تم رفض المقايضة', data: { status: newStatus } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/trades/history
router.get('/history', authenticate, async (req, res) => {
  try {
    const trades = await all(
      `SELECT t.*,
              ia.title as item_a_title, ia.image_urls as item_a_images,
              ib.title as item_b_title, ib.image_urls as item_b_images,
              ua.name as user_a_name,  ub.name as user_b_name
       FROM trades t
       JOIN items ia ON t.item_a_id = ia.id
       JOIN items ib ON t.item_b_id = ib.id
       JOIN users ua ON t.user_a_id = ua.id
       JOIN users ub ON t.user_b_id = ub.id
       WHERE t.user_a_id = $1 OR t.user_b_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    const result = trades.map(t => {
      const isUserA = t.user_a_id === req.user.id;
      const { user_a_code, user_b_code, ...rest } = t;
      return {
        ...rest,
        my_code: isUserA ? user_a_code : user_b_code,
        my_verified: isUserA ? t.verified_a : t.verified_b,
        other_verified: isUserA ? t.verified_b : t.verified_a,
      };
    });

    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/trades/:id/review
router.post('/:id/review', authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ success: false, error: 'التقييم يجب أن يكون بين 1 و 5' });

    const trade = await get('SELECT * FROM trades WHERE id = $1', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, error: 'المقايضة غير موجودة' });

    const reviewee_id = trade.user_a_id === req.user.id ? trade.user_b_id : trade.user_a_id;

    const existing = await get('SELECT id FROM reviews WHERE trade_id = $1 AND reviewer_id = $2', [req.params.id, req.user.id]);
    if (existing) return res.status(409).json({ success: false, error: 'تم التقييم مسبقاً' });

    const review = await get(
      `INSERT INTO reviews (trade_id, reviewer_id, reviewee_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.params.id, req.user.id, reviewee_id, rating, comment || '']
    );

    // Update trust score
    const avg = await get('SELECT ROUND(AVG(rating)::numeric, 1) as avg FROM reviews WHERE reviewee_id = $1', [reviewee_id]);
    if (avg?.avg) {
      await run('UPDATE users SET trust_score = $1 WHERE id = $2', [avg.avg, reviewee_id]);
    }

    res.status(201).json({ success: true, message: 'شكراً على تقييمك! ⭐', data: { id: review.id, rating } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/trades/:id/verify
router.post('/:id/verify', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق' });

    const trade = await get('SELECT * FROM trades WHERE id = $1', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, error: 'المقايضة غير موجودة' });
    if (trade.status === 'completed') return res.status(400).json({ success: false, error: 'المقايضة مكتملة بالفعل' });

    const isUserA = trade.user_a_id === req.user.id;
    const isUserB = trade.user_b_id === req.user.id;
    if (!isUserA && !isUserB) return res.status(403).json({ success: false, error: 'غير مصرح لك' });

    // User A must enter User B's code and vice versa (confirms physical exchange)
    const expectedCode = isUserA ? trade.user_b_code : trade.user_a_code;
    if (code !== expectedCode) return res.status(400).json({ success: false, error: 'رمز التحقق غير صحيح!' });

    const updateCol = isUserA ? 'verified_a' : 'verified_b';
    const updated = await get(
      `UPDATE trades SET ${updateCol} = 1 WHERE id = $1
       RETURNING verified_a, verified_b, request_id, user_a_id, user_b_id`,
      [trade.id]
    );

    if (updated.verified_a && updated.verified_b) {
      await Promise.all([
        run(`UPDATE trades SET status = 'completed', completed_at = NOW() WHERE id = $1`, [trade.id]),
        run(`UPDATE trade_requests SET status = 'completed' WHERE id = $1`, [updated.request_id]),
        run(`INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES ($1, $2, $3, 'trade_completed', $4)`,
          [updated.user_a_id, '✅ مقايضة تمت بنجاح!', 'تهانينا! لا تنسَ تقييم الطرف الآخر.', trade.id]),
        run(`INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES ($1, $2, $3, 'trade_completed', $4)`,
          [updated.user_b_id, '✅ مقايضة تمت بنجاح!', 'تهانينا! لا تنسَ تقييم الطرف الآخر.', trade.id]),
      ]);

      // Auto system message
      const io = req.app.get('io');
      sendSystemMessage(updated.request_id, '🎉 تمت المقايضة بنجاح! شكراً لاستخدامكم قايض. لا تنسوا التقييم.', io).catch(() => {});

      if (io) {
        io.to(`user_${updated.user_a_id}`).emit('trade_completed', { tradeId: trade.id });
        io.to(`user_${updated.user_b_id}`).emit('trade_completed', { tradeId: trade.id });
      }

      return res.json({ success: true, message: 'تم إكمال المقايضة بنجاح! 🎉', data: { status: 'completed' } });
    }

    const otherUserId = isUserA ? trade.user_b_id : trade.user_a_id;
    if (req.app.get('io')) {
      req.app.get('io').to(`user_${otherUserId}`).emit('trade_verified_partial', { tradeId: trade.id });
    }

    res.json({ success: true, message: 'تم التحقق من الطرف الأول، بانتظار الطرف الآخر', data: { status: 'active' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
