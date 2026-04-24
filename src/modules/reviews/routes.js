// =============================================
// Qayed - Reviews Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/reviews/user/:userId
router.get('/user/:userId', (req, res) => {
  try {
    const reviews = all(
      `SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar 
       FROM reviews r JOIN users u ON r.reviewer_id = u.id 
       WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`,
      [req.params.userId]
    );
    
    const avg = get('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE reviewee_id = ?', [req.params.userId]);
    
    res.json({
      success: true,
      data: {
        reviews,
        summary: {
          average: avg && avg.avg ? Math.round(avg.avg * 10) / 10 : 0,
          count: avg ? avg.count : 0
        }
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/reviews/trade/:tradeId
router.get('/trade/:tradeId', (req, res) => {
  try {
    const reviews = all(
      `SELECT r.*, u.name as reviewer_name FROM reviews r 
       JOIN users u ON r.reviewer_id = u.id WHERE r.trade_id = ?`,
      [req.params.tradeId]
    );
    res.json({ success: true, data: reviews });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/reviews/my
router.get('/my', authenticate, (req, res) => {
  try {
    const given = all(
      `SELECT r.*, u.name as reviewee_name FROM reviews r 
       JOIN users u ON r.reviewee_id = u.id WHERE r.reviewer_id = ? ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    const received = all(
      `SELECT r.*, u.name as reviewer_name FROM reviews r 
       JOIN users u ON r.reviewer_id = u.id WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { given, received } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
