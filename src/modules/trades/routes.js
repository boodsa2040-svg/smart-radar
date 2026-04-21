// =============================================
// Qayed - Trades Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// POST /api/v1/trades/request
router.post('/request', authenticate, (req, res) => {
  try {
    const { offered_item_id, wanted_item_id, message } = req.body;
    if (!offered_item_id || !wanted_item_id) return res.status(400).json({ success: false, error: 'يرجى تحديد المنتجين' });

    const offered = get('SELECT * FROM items WHERE id=? AND user_id=? AND status=\'active\'', [offered_item_id, req.user.id]);
    if (!offered) return res.status(400).json({ success: false, error: 'المنتج المعروض غير موجود أو ليس ملكك' });

    const wanted = get('SELECT * FROM items WHERE id=? AND status=\'active\'', [wanted_item_id]);
    if (!wanted) return res.status(400).json({ success: false, error: 'المنتج المطلوب غير موجود' });
    if (wanted.user_id === req.user.id) return res.status(400).json({ success: false, error: 'لا يمكنك مقايضة مع نفسك' });

    const existing = get('SELECT id FROM trade_requests WHERE requester_id=? AND wanted_item_id=? AND status=\'pending\'', [req.user.id, wanted_item_id]);
    if (existing) return res.status(409).json({ success: false, error: 'يوجد طلب معلّق بالفعل' });

    const id = uuidv4();
    run('INSERT INTO trade_requests (id,requester_id,requestee_id,offered_item_id,wanted_item_id,message) VALUES (?,?,?,?,?,?)',
      [id, req.user.id, wanted.user_id, offered_item_id, wanted_item_id, message||'']);

    run('INSERT INTO notifications (id,user_id,title,body,type,reference_id) VALUES (?,?,?,?,?,?)',
      [uuidv4(), wanted.user_id, '🔔 طلب مقايضة جديد', `${req.user.name} يريد مقايضة "${offered.title}" بـ "${wanted.title}"`, 'trade_request', id]);

    if (req.app.get('io')) {
      req.app.get('io').to(`user_${wanted.user_id}`).emit('new_trade_request', { id, requester_name: req.user.name });
    }

    res.status(201).json({ success: true, message: 'تم إرسال طلب المقايضة ✅', data: { id, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/trades/requests
router.get('/requests', authenticate, (req, res) => {
  try {
    const { type = 'all', status } = req.query;
    let q = `SELECT tr.*, oi.title as offered_title, oi.image_urls as offered_images, wi.title as wanted_title, wi.image_urls as wanted_images, req.name as requester_name, req.trust_score as requester_trust, ree.name as requestee_name
      FROM trade_requests tr JOIN items oi ON tr.offered_item_id=oi.id JOIN items wi ON tr.wanted_item_id=wi.id JOIN users req ON tr.requester_id=req.id JOIN users ree ON tr.requestee_id=ree.id WHERE 1=1`;
    const p = [];
    if (type==='incoming') { q+=' AND tr.requestee_id=?'; p.push(req.user.id); }
    else if (type==='outgoing') { q+=' AND tr.requester_id=?'; p.push(req.user.id); }
    else { q+=' AND (tr.requester_id=? OR tr.requestee_id=?)'; p.push(req.user.id, req.user.id); }
    if (status) { q+=' AND tr.status=?'; p.push(status); }
    q += ' ORDER BY tr.created_at DESC';

    const requests = all(q, p);
    requests.forEach(r => { r.offered_images=JSON.parse(r.offered_images||'[]'); r.wanted_images=JSON.parse(r.wanted_images||'[]'); });
    res.json({ success: true, data: requests });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/v1/trades/requests/:id
router.patch('/requests/:id', authenticate, (req, res) => {
  try {
    const { action } = req.body;
    if (!['accept','reject'].includes(action)) return res.status(400).json({ success: false, error: 'الإجراء غير صحيح' });

    const request = get('SELECT * FROM trade_requests WHERE id=? AND requestee_id=?', [req.params.id, req.user.id]);
    if (!request) return res.status(404).json({ success: false, error: 'طلب المقايضة غير موجود' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, error: 'تم الرد مسبقاً' });

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    run('UPDATE trade_requests SET status=?, responded_at=datetime(\'now\') WHERE id=?', [newStatus, req.params.id]);

    if (action === 'accept') {
      const tradeId = uuidv4();
      const codeA = Math.floor(1000 + Math.random() * 9000).toString();
      const codeB = Math.floor(1000 + Math.random() * 9000).toString();
      
      run('INSERT INTO trades (id,request_id,item_a_id,item_b_id,user_a_id,user_b_id,user_a_code,user_b_code) VALUES (?,?,?,?,?,?,?,?)',
        [tradeId, request.id, request.offered_item_id, request.wanted_item_id, request.requester_id, request.requestee_id, codeA, codeB]);
      run('UPDATE items SET status=\'traded\' WHERE id IN (?,?)', [request.offered_item_id, request.wanted_item_id]);
      run('UPDATE users SET total_trades=total_trades+1 WHERE id=?', [request.requester_id]);
      run('UPDATE users SET total_trades=total_trades+1 WHERE id=?', [request.requestee_id]);
      run('INSERT INTO notifications (id,user_id,title,body,type,reference_id) VALUES (?,?,?,?,?,?)',
        [uuidv4(), request.requester_id, '🎉 تم قبول المقايضة!', `${req.user.name} وافق! تواصلوا لإتمام الصفقة`, 'trade_accepted', tradeId]);
    } else {
      run('INSERT INTO notifications (id,user_id,title,body,type,reference_id) VALUES (?,?,?,?,?,?)',
        [uuidv4(), request.requester_id, '❌ تم رفض المقايضة', 'جرّب عروض أخرى!', 'trade_rejected', request.id]);
    }

    if (req.app.get('io')) {
      req.app.get('io').to(`user_${request.requester_id}`).emit('trade_status_changed', { id: request.id, status: newStatus });
    }

    res.json({ success: true, message: action==='accept'?'تم قبول المقايضة 🎉':'تم رفض المقايضة', data: { status: newStatus } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/trades/history
router.get('/history', authenticate, (req, res) => {
  try {
    const trades = all(`SELECT t.*, ia.title as item_a_title, ia.image_urls as item_a_images, ib.title as item_b_title, ib.image_urls as item_b_images, ua.name as user_a_name, ub.name as user_b_name
      FROM trades t JOIN items ia ON t.item_a_id=ia.id JOIN items ib ON t.item_b_id=ib.id JOIN users ua ON t.user_a_id=ua.id JOIN users ub ON t.user_b_id=ub.id
      WHERE t.user_a_id=? OR t.user_b_id=? ORDER BY t.created_at DESC`, [req.user.id, req.user.id]);
    
    trades.forEach(t => { 
      t.item_a_images = JSON.parse(t.item_a_images||'[]');
      t.item_b_images = JSON.parse(t.item_b_images||'[]');
      
      let isUserA = t.user_a_id === req.user.id;
      t.my_code = isUserA ? t.user_a_code : t.user_b_code;
      t.my_verified = isUserA ? t.verified_a : t.verified_b;
      t.other_verified = isUserA ? t.verified_b : t.verified_a;
      
      delete t.user_a_code;
      delete t.user_b_code;
    });

    res.json({ success: true, data: trades });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/trades/:id/review
router.post('/:id/review', authenticate, (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating<1 || rating>5) return res.status(400).json({ success: false, error: 'التقييم يجب أن يكون بين 1 و 5' });
    const trade = get('SELECT * FROM trades WHERE id=?', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, error: 'المقايضة غير موجودة' });
    const reviewee_id = trade.user_a_id===req.user.id ? trade.user_b_id : trade.user_a_id;
    const existing = get('SELECT id FROM reviews WHERE trade_id=? AND reviewer_id=?', [req.params.id, req.user.id]);
    if (existing) return res.status(409).json({ success: false, error: 'تم التقييم مسبقاً' });
    const id = uuidv4();
    run('INSERT INTO reviews (id,trade_id,reviewer_id,reviewee_id,rating,comment) VALUES (?,?,?,?,?,?)',
      [id, req.params.id, req.user.id, reviewee_id, rating, comment||'']);
    const avg = get('SELECT AVG(rating) as avg FROM reviews WHERE reviewee_id=?', [reviewee_id]);
    if (avg && avg.avg) run('UPDATE users SET trust_score=? WHERE id=?', [Math.round(avg.avg*10)/10, reviewee_id]);
    res.status(201).json({ success: true, message: 'شكراً على تقييمك! ⭐', data: { id, rating } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/trades/:id/verify
router.post('/:id/verify', authenticate, (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق' });

    const trade = get('SELECT * FROM trades WHERE id=?', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, error: 'المقايضة غير موجودة' });
    if (trade.status === 'completed') return res.status(400).json({ success: false, error: 'المقايضة مكتملة بالفعل' });

    let isUserA = trade.user_a_id === req.user.id;
    let isUserB = trade.user_b_id === req.user.id;
    
    if (!isUserA && !isUserB) return res.status(403).json({ success: false, error: 'غير مصرح لك بإدارة هذا الطلب' });

    // User A expects User B's code, User B expects User A's code
    let expectedCode = isUserA ? trade.user_b_code : trade.user_a_code;
    
    if (code !== expectedCode) return res.status(400).json({ success: false, error: 'رمز التحقق غير صحيح!' });

    if (isUserA) run('UPDATE trades SET verified_a=1 WHERE id=?', [trade.id]);
    else run('UPDATE trades SET verified_b=1 WHERE id=?', [trade.id]);

    const updated = get('SELECT verified_a, verified_b FROM trades WHERE id=?', [trade.id]);
    
    if (updated.verified_a && updated.verified_b) {
      run('UPDATE trades SET status=\'completed\', completed_at=datetime(\'now\') WHERE id=?', [trade.id]);
      run('UPDATE trade_requests SET status=\'completed\' WHERE id=?', [trade.request_id]);
      
      run('INSERT INTO notifications (id,user_id,title,body,type,reference_id) VALUES (?,?,?,?,?,?)', [uuidv4(), trade.user_a_id, '✅ مقايضة تمت بنجاح!', 'تهانينا! لقد تمت المقايضة. لا تنسَ التقييم.', 'trade_completed', trade.id]);
      run('INSERT INTO notifications (id,user_id,title,body,type,reference_id) VALUES (?,?,?,?,?,?)', [uuidv4(), trade.user_b_id, '✅ مقايضة تمت بنجاح!', 'تهانينا! لقد تمت المقايضة. لا تنسَ التقييم.', 'trade_completed', trade.id]);

      if (req.app.get('io')) {
        req.app.get('io').to(`user_${trade.user_a_id}`).emit('trade_completed', { tradeId: trade.id });
        req.app.get('io').to(`user_${trade.user_b_id}`).emit('trade_completed', { tradeId: trade.id });
      }

      return res.json({ success: true, message: 'تم إكمال المقايضة بنجاح! 🎉', data: { status: 'completed' } });
    }

    if (req.app.get('io')) {
      const otherUserId = isUserA ? trade.user_b_id : trade.user_a_id;
      req.app.get('io').to(`user_${otherUserId}`).emit('trade_verified_partial', { tradeId: trade.id });
    }

    res.json({ success: true, message: 'تم التحقق من الطرف الأول، بانتظار الطرف الآخر', data: { status: 'active' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
