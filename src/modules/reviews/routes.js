// =============================================
// Qayed - Reviews Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

// GET /api/v1/reviews/user/:userId
router.get('/user/:userId', async (req, res) => {
  try {
    const [reviews, summary] = await Promise.all([
      all(
        `SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
         FROM reviews r JOIN users u ON r.reviewer_id = u.id
         WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC`,
        [req.params.userId]
      ),
      get(
        `SELECT ROUND(AVG(rating)::numeric, 1) as avg, COUNT(*) as count
         FROM reviews WHERE reviewee_id = $1`,
        [req.params.userId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        reviews,
        summary: {
          average: parseFloat(summary?.avg || 0),
          count: parseInt(summary?.count || 0),
        },
      },
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/reviews/trade/:tradeId
router.get('/trade/:tradeId', async (req, res) => {
  try {
    const reviews = await all(
      `SELECT r.*, u.name as reviewer_name FROM reviews r
       JOIN users u ON r.reviewer_id = u.id WHERE r.trade_id = $1`,
      [req.params.tradeId]
    );
    res.json({ success: true, data: reviews });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/reviews/my
router.get('/my', authenticate, async (req, res) => {
  try {
    const [given, received] = await Promise.all([
      all(
        `SELECT r.*, u.name as reviewee_name FROM reviews r
         JOIN users u ON r.reviewee_id = u.id
         WHERE r.reviewer_id = $1 ORDER BY r.created_at DESC`,
        [req.user.id]
      ),
      all(
        `SELECT r.*, u.name as reviewer_name FROM reviews r
         JOIN users u ON r.reviewer_id = u.id
         WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC`,
        [req.user.id]
      ),
    ]);
    res.json({ success: true, data: { given, received } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
