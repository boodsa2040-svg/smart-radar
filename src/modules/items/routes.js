// =============================================
// Qayed - Items Routes (PostgreSQL)
// =============================================
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../../config/database');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const CATEGORIES = ['إلكترونيات','هواتف','أجهزة كمبيوتر','كاميرات','ساعات','ملابس','أحذية','إكسسوارات','كتب','ألعاب','أثاث','أدوات منزلية','رياضة','سيارات','أخرى'];
const CONDITIONS = ['جديد','ممتاز','جيد جداً','جيد','مستعمل'];

function analyzeImage(filename) {
  return {
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    condition: CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)],
    estimated_value: Math.floor(Math.random() * 2000 + 100),
    confidence: (Math.random() * 0.3 + 0.7).toFixed(2),
    tags: ['قايض', 'مقايضة'],
    analyzed_at: new Date().toISOString()
  };
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// GET /api/v1/items/categories/list
router.get('/categories/list', async (req, res) => {
  try {
    const cats = await all(`SELECT * FROM categories WHERE is_active = 1 ORDER BY CASE WHEN name = 'other' THEN 1 ELSE 0 END, label ASC`);
    res.json({ success: true, data: cats });
  } catch (err) {
    res.json({ success: true, data: [
      { name: 'electronics', label: 'إلكترونيات', icon: 'phone-portrait-outline', color: '#00BFA6' },
      { name: 'fashion', label: 'أزياء', icon: 'shirt-outline', color: '#6366F1' },
      { name: 'other', label: 'أخرى', icon: 'apps-outline', color: '#6B7280' }
    ]});
  }
});

// GET /api/v1/items/my
router.get('/my', authenticate, async (req, res) => {
  try {
    const items = await all(
      `SELECT i.*, u.name as owner_name FROM items i
       JOIN users u ON i.user_id = u.id
       WHERE i.user_id = $1 ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items/nearby
router.get('/nearby', authenticate, async (req, res) => {
  try {
    const { latitude, longitude, radius = 50 } = req.query;
    const lat = parseFloat(latitude) || 0;
    const lon = parseFloat(longitude) || 0;

    // Use PostgreSQL earth distance formula for efficiency
    const items = await all(
      `SELECT i.*, u.name as owner_name, u.trust_score as owner_trust,
              (6371 * acos(
                cos(radians($1)) * cos(radians(i.latitude)) *
                cos(radians(i.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(i.latitude))
              )) AS distance_km
       FROM items i
       JOIN users u ON i.user_id = u.id
       WHERE i.status = 'active' AND i.user_id != $3
         AND i.latitude != 0 AND i.longitude != 0
       HAVING (6371 * acos(
         cos(radians($1)) * cos(radians(i.latitude)) *
         cos(radians(i.longitude) - radians($2)) +
         sin(radians($1)) * sin(radians(i.latitude))
       )) <= $4
       ORDER BY distance_km ASC LIMIT 50`,
      [lat, lon, req.user.id, parseFloat(radius)]
    );
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items/matches
router.get('/matches', authenticate, async (req, res) => {
  try {
    const myItems = await all(
      `SELECT * FROM items WHERE user_id = $1 AND status = 'active'`,
      [req.user.id]
    );
    if (!myItems.length) return res.json({ success: true, data: [], message: 'أضف منتجاً أولاً' });

    const user = await get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const myCategories = myItems.map(i => i.category);
    const myAvgValue = myItems.reduce((s, i) => s + parseFloat(i.estimated_value), 0) / myItems.length;

    const others = await all(
      `SELECT i.*, u.name as owner_name, u.trust_score as owner_trust, u.city as owner_city
       FROM items i JOIN users u ON i.user_id = u.id
       WHERE i.status = 'active' AND i.user_id != $1 LIMIT 100`,
      [req.user.id]
    );

    const matches = others.map(item => {
      const catSim = myCategories.includes(item.category) ? 1 : 0.3;
      const valScore = Math.max(0, 1 - Math.abs(parseFloat(item.estimated_value) - myAvgValue) / Math.max(myAvgValue, 1));
      const dist = getDistance(
        parseFloat(user.latitude), parseFloat(user.longitude),
        parseFloat(item.latitude), parseFloat(item.longitude)
      );
      const distScore = Math.max(0, 1 - (dist / 100));
      const trustScore = (parseFloat(item.owner_trust) || 5) / 5;
      item.distance_km = Math.round(dist * 10) / 10;
      item.match_score = Math.round((catSim * 0.4 + distScore * 0.25 + valScore * 0.2 + trustScore * 0.1 + 0.025) * 100);
      return item;
    }).sort((a, b) => b.match_score - a.match_score);

    res.json({ success: true, data: matches.slice(0, 20), meta: { total_analyzed: others.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/items
router.post('/', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, latitude, longitude, city, wants } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المنتج' });

    const image_urls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    let ai = {};
    if (req.files && req.files.length) ai = analyzeImage(req.files[0].filename);

    const item = await get(
      `INSERT INTO items
         (user_id, title, description, category, condition, estimated_value,
          image_urls, latitude, longitude, city, ai_analysis, wants)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.user.id, title, description || '',
        category || ai.category || 'أخرى',
        condition || ai.condition || 'مستعمل',
        parseFloat(estimated_value) || ai.estimated_value || 0,
        image_urls,
        parseFloat(latitude) || 0, parseFloat(longitude) || 0,
        city || '', JSON.stringify(ai), wants || ''
      ]
    );

    res.status(201).json({ success: true, message: 'تم إضافة المنتج بنجاح 🎉', data: item });
  } catch (err) {
    console.error('Add item error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/items
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, condition, city, search, page = 1, limit = 20, sort = 'newest' } = req.query;
    const params = [];
    let idx = 1;

    let where = `WHERE i.status = 'active'`;
    if (category) { where += ` AND i.category = $${idx++}`; params.push(category); }
    if (condition) { where += ` AND i.condition = $${idx++}`; params.push(condition); }
    if (city)      { where += ` AND i.city ILIKE $${idx++}`; params.push(`%${city}%`); }
    if (search)    { where += ` AND (i.title ILIKE $${idx} OR i.description ILIKE $${idx++})`; params.push(`%${search}%`); }

    const orderBy = sort === 'value_high' ? 'i.estimated_value DESC'
      : sort === 'value_low' ? 'i.estimated_value ASC'
      : 'i.created_at DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [items, totalRow] = await Promise.all([
      all(
        `SELECT i.*, u.name as owner_name, u.trust_score as owner_trust
         FROM items i JOIN users u ON i.user_id = u.id
         ${where} ORDER BY ${orderBy}
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
      get(
        `SELECT COUNT(*) as total FROM items i ${where}`,
        params
      )
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(totalRow?.total || 0) }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await get(
      `SELECT i.*, u.name as owner_name, u.trust_score as owner_trust, u.city as owner_city,
              u.total_trades as owner_trades
       FROM items i JOIN users u ON i.user_id = u.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

    // Increment view count (fire & forget)
    run('UPDATE items SET views_count = views_count + 1 WHERE id = $1', [req.params.id]).catch(() => {});

    const similar = await all(
      `SELECT id, title, category, estimated_value, image_urls FROM items
       WHERE category = $1 AND id != $2 AND status = 'active' LIMIT 5`,
      [item.category, item.id]
    );

    res.json({ success: true, data: { ...item, similar_items: similar } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/v1/items/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, city, wants } = req.body;
    const existing = await get('SELECT * FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'المنتج غير موجود أو ليس لك صلاحية التعديل' });

    const updated = await get(
      `UPDATE items SET
         title = $1, description = $2, category = $3, condition = $4,
         estimated_value = $5, city = $6, wants = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        title || existing.title, description ?? existing.description,
        category || existing.category, condition || existing.condition,
        parseFloat(estimated_value) || existing.estimated_value,
        city || existing.city, wants ?? existing.wants,
        req.params.id
      ]
    );
    res.json({ success: true, message: 'تم تحديث المنتج ✅', data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/items/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const item = await get('SELECT * FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    await run(`UPDATE items SET status = 'deleted' WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
