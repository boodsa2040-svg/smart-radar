// =============================================
// Qayed - Items Routes (sql.js)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
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
router.get('/categories/list', (req, res) => {
  res.json({ success: true, data: CATEGORIES });
});

// GET /api/v1/items/my
router.get('/my', authenticate, (req, res) => {
  try {
    const items = all('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    items.forEach(i => { i.image_urls = JSON.parse(i.image_urls||'[]'); i.ai_analysis = JSON.parse(i.ai_analysis||'{}'); });
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items/nearby
router.get('/nearby', authenticate, (req, res) => {
  try {
    const { latitude, longitude, radius = 50 } = req.query;
    const lat = parseFloat(latitude)||0, lon = parseFloat(longitude)||0;
    const items = all('SELECT i.*,u.name as owner_name,u.trust_score as owner_trust FROM items i JOIN users u ON i.user_id=u.id WHERE i.status=\'active\' AND i.user_id!=? LIMIT 50', [req.user.id]);
    const nearby = items.map(i => {
      i.image_urls = JSON.parse(i.image_urls||'[]'); i.ai_analysis = JSON.parse(i.ai_analysis||'{}');
      i.distance_km = Math.round(getDistance(lat,lon,i.latitude,i.longitude)*10)/10;
      return i;
    }).filter(i => i.distance_km <= parseFloat(radius)).sort((a,b) => a.distance_km-b.distance_km);
    res.json({ success: true, data: nearby });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items/matches
router.get('/matches', authenticate, (req, res) => {
  try {
    const myItems = all('SELECT * FROM items WHERE user_id=? AND status=\'active\'', [req.user.id]);
    if (!myItems.length) return res.json({ success: true, data: [], message: 'أضف منتجاً أولاً' });

    const others = all('SELECT i.*,u.name as owner_name,u.trust_score as owner_trust,u.city as owner_city FROM items i JOIN users u ON i.user_id=u.id WHERE i.status=\'active\' AND i.user_id!=? LIMIT 100', [req.user.id]);
    const myCategories = myItems.map(i=>i.category);
    const myAvgValue = myItems.reduce((s,i)=>s+i.estimated_value,0)/myItems.length;
    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);

    const matches = others.map(item => {
      item.image_urls = JSON.parse(item.image_urls||'[]'); item.ai_analysis = JSON.parse(item.ai_analysis||'{}');
      const catSim = myCategories.includes(item.category)?1:0.3;
      const valScore = Math.max(0, 1-Math.abs(item.estimated_value-myAvgValue)/Math.max(myAvgValue,1));
      const dist = getDistance(user.latitude,user.longitude,item.latitude,item.longitude);
      const distScore = Math.max(0, 1-(dist/100));
      item.distance_km = Math.round(dist*10)/10;
      const trustScore = (item.owner_trust||5)/5;
      item.match_score = Math.round((catSim*0.4+distScore*0.25+valScore*0.2+trustScore*0.1+0.025)*100);
      return item;
    }).sort((a,b) => b.match_score-a.match_score);

    res.json({ success: true, data: matches.slice(0,20), meta: { total_analyzed: others.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/items
router.post('/', authenticate, upload.array('images', 5), (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, latitude, longitude, city } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المنتج' });

    const id = uuidv4();
    const image_urls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    let ai = {}; if (req.files && req.files.length) ai = analyzeImage(req.files[0].filename);

    run('INSERT INTO items (id,user_id,title,description,category,condition,estimated_value,image_urls,latitude,longitude,city,ai_analysis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, req.user.id, title, description||'', category||ai.category||'أخرى', condition||ai.condition||'مستعمل',
       parseFloat(estimated_value)||ai.estimated_value||0, JSON.stringify(image_urls),
       parseFloat(latitude)||0, parseFloat(longitude)||0, city||'', JSON.stringify(ai)]);

    const item = get('SELECT * FROM items WHERE id=?', [id]);
    item.image_urls = JSON.parse(item.image_urls||'[]'); item.ai_analysis = JSON.parse(item.ai_analysis||'{}');
    res.status(201).json({ success: true, message: 'تم إضافة المنتج بنجاح 🎉', data: item });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items
router.get('/', optionalAuth, (req, res) => {
  try {
    const { category, condition, city, search, page=1, limit=20, sort='newest' } = req.query;
    let q = 'SELECT i.*,u.name as owner_name,u.trust_score as owner_trust FROM items i JOIN users u ON i.user_id=u.id WHERE i.status=\'active\'';
    const p = [];
    if (category) { q += ' AND i.category=?'; p.push(category); }
    if (condition) { q += ' AND i.condition=?'; p.push(condition); }
    if (city) { q += ' AND i.city LIKE ?'; p.push(`%${city}%`); }
    if (search) { q += ' AND (i.title LIKE ? OR i.description LIKE ?)'; p.push(`%${search}%`,`%${search}%`); }

    if (sort==='value_high') q+=' ORDER BY i.estimated_value DESC';
    else if (sort==='value_low') q+=' ORDER BY i.estimated_value ASC';
    else q+=' ORDER BY i.created_at DESC';

    const offset = (parseInt(page)-1)*parseInt(limit);
    q += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;

    const items = all(q, p);
    items.forEach(i => { i.image_urls=JSON.parse(i.image_urls||'[]'); i.ai_analysis=JSON.parse(i.ai_analysis||'{}'); });

    const total = get('SELECT COUNT(*) as total FROM items WHERE status=\'active\'', []);
    res.json({ success: true, data: items, pagination: { page:parseInt(page), limit:parseInt(limit), total: total?total.total:0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/items/:id
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const item = get('SELECT i.*,u.name as owner_name,u.trust_score as owner_trust,u.city as owner_city FROM items i JOIN users u ON i.user_id=u.id WHERE i.id=?', [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    item.image_urls = JSON.parse(item.image_urls||'[]'); item.ai_analysis = JSON.parse(item.ai_analysis||'{}');
    run('UPDATE items SET views_count=views_count+1 WHERE id=?', [req.params.id]);
    const similar = all('SELECT id,title,category,estimated_value,image_urls FROM items WHERE category=? AND id!=? AND status=\'active\' LIMIT 5', [item.category, item.id]);
    similar.forEach(s => { s.image_urls=JSON.parse(s.image_urls||'[]'); });
    res.json({ success: true, data: { ...item, similar_items: similar } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/v1/items/:id
router.put('/:id', authenticate, (req, res) => {
  try {
    const { title, description, category, condition, estimated_value, city } = req.body;
    const item = get('SELECT * FROM items WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    run('UPDATE items SET title=?,description=?,category=?,condition=?,estimated_value=?,city=?,updated_at=datetime(\'now\') WHERE id=?',
      [title||item.title, description||item.description, category||item.category, condition||item.condition, estimated_value||item.estimated_value, city||item.city, req.params.id]);
    const updated = get('SELECT * FROM items WHERE id=?', [req.params.id]);
    updated.image_urls = JSON.parse(updated.image_urls||'[]'); updated.ai_analysis = JSON.parse(updated.ai_analysis||'{}');
    res.json({ success: true, message: 'تم تحديث المنتج', data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/items/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    const item = get('SELECT * FROM items WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    run('UPDATE items SET status=\'deleted\' WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
