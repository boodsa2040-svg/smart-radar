// =============================================
//  قايض - Qayed Backend API Server
//  Smart Bartering Platform
// =============================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const rateLimit = require('express-rate-limit');
const { initializeDatabase } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Socket.io Setup
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);

// ---- Middleware ----
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Admin Dashboard
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')); });

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

// ---- Initialize Database & Start ----
(async () => {
  await initializeDatabase();

// ---- API Routes ----
const authRoutes = require('./modules/auth/routes');
const userRoutes = require('./modules/users/routes');
const itemRoutes = require('./modules/items/routes');
const tradeRoutes = require('./modules/trades/routes');
const chatRoutes = require('./modules/chat/routes');
const adminRoutes = require('./modules/admin/routes');
const reviewRoutes = require('./modules/reviews/routes');
const notificationRoutes = require('./modules/notifications/routes');
const wishlistRoutes = require('./modules/wishlist/routes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/trades', tradeRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);

// ---- Health Check & API Info ----
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    app: 'قايض - Qayed API',
    version: '2.0.0',
    description: 'منصة المقايضة الذكية',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      items: '/api/v1/items',
      trades: '/api/v1/trades',
      chat: '/api/v1/chat',
      reviews: '/api/v1/reviews',
      notifications: '/api/v1/notifications',
      wishlist: '/api/v1/wishlist',
      admin: '/api/v1/admin'
    },
    docs: {
      register: 'POST /api/v1/auth/register { phone, name, password }',
      login: 'POST /api/v1/auth/login { loginId, password }',
      add_item: 'POST /api/v1/items { title, description, category } + images',
      get_items: 'GET /api/v1/items?category=&city=&search=',
      matches: 'GET /api/v1/items/matches',
      nearby: 'GET /api/v1/items/nearby?latitude=&longitude=',
      trade_request: 'POST /api/v1/trades/request { offered_item_id, wanted_item_id }',
      my_requests: 'GET /api/v1/trades/requests?type=incoming|outgoing',
      respond: 'PATCH /api/v1/trades/requests/:id { action: accept|reject }',
      chat: 'GET /api/v1/chat/conversations',
      send_message: 'POST /api/v1/chat/:tradeId/messages { content }',
      notifications: 'GET /api/v1/notifications',
      wishlist: 'GET /api/v1/wishlist',
      add_wishlist: 'POST /api/v1/wishlist { item_id }',
      reviews: 'GET /api/v1/reviews/user/:userId'
    }
  });
});

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ---- Seed Demo Data (PostgreSQL) ----
app.post('/api/v1/seed', async (req, res) => {
  const { get, run, all } = require('./config/database');
  const bcrypt = require('bcryptjs');

  // Check if already seeded
  const existing = await all('SELECT COUNT(*) as c FROM items', []);
  if (existing && existing[0] && parseInt(existing[0].c) > 3) {
    return res.json({ success: true, message: 'البيانات الموجودة كافية', seeded: false });
  }

  const hash = await bcrypt.hash('demo1234', 12);
  const users = [
    { phone: '0511111111', name: 'سارة الأحمد',      city: 'الرياض', lat: 24.71, lng: 46.67 },
    { phone: '0522222222', name: 'خالد العتيبي',     city: 'جدة',    lat: 21.54, lng: 39.17 },
    { phone: '0533333333', name: 'نورة السليمان',    city: 'الدمام', lat: 26.43, lng: 50.10 },
    { phone: '0544444444', name: 'عبدالله القحطاني', city: 'مكة',    lat: 21.38, lng: 39.86 },
  ];

  const itemsData = [
    { title: 'كاميرا كانون EOS R5',      desc: 'كاميرا احترافية بحالة ممتازة',   cat: 'كاميرات',     cond: 'ممتاز',    val: 3500 },
    { title: 'آيفون 15 برو ماكس',         desc: '256GB لون تيتانيوم أزرق - جديد', cat: 'هواتف',       cond: 'جديد',     val: 4200 },
    { title: 'ساعة أبل ووتش Series 9',    desc: 'مع سوارين رياضي وجلد',           cat: 'ساعات',       cond: 'ممتاز',    val: 1800 },
    { title: 'بلايستيشن 5 + يدتين',       desc: 'PS5 Digital مع ألعاب متعددة',    cat: 'ألعاب',       cond: 'جيد جداً', val: 1500 },
    { title: 'لابتوب ماك بوك برو M3',    desc: '14 بوصة 16GB RAM 512GB SSD',     cat: 'إلكترونيات',  cond: 'ممتاز',    val: 6500 },
    { title: 'سماعة AirPods Max',         desc: 'لون فضي - استخدام 3 أشهر',       cat: 'إلكترونيات',  cond: 'جيد جداً', val: 1200 },
    { title: 'مجموعة كتب برمجة احترافية', desc: 'Clean Code, DDIA, System Design', cat: 'كتب',        cond: 'جيد',      val: 400  },
    { title: 'دراجة Trek هوائية رياضية',  desc: 'مقاس L ألمنيوم خفيف - 21 سرعة', cat: 'رياضة',       cond: 'جيد جداً', val: 2200 },
  ];

  const userIds = [];
  for (const u of users) {
    const ex = await get('SELECT id FROM users WHERE phone = $1', [u.phone]);
    if (!ex) {
      const inserted = await get(
        `INSERT INTO users (phone, name, password_hash, city, latitude, longitude, is_verified, trust_score)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7) RETURNING id`,
        [u.phone, u.name, hash, u.city, u.lat, u.lng, (4 + Math.random()).toFixed(1)]
      );
      userIds.push(inserted.id);
    } else {
      userIds.push(ex.id);
    }
  }

  let created = 0;
  for (let i = 0; i < itemsData.length; i++) {
    const userId = userIds[i % userIds.length];
    const user = await get('SELECT * FROM users WHERE id = $1', [userId]);
    const item = itemsData[i];
    await run(
      `INSERT INTO items (user_id, title, description, category, condition, estimated_value, city, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, item.title, item.desc, item.cat, item.cond, item.val,
       user?.city || '', user?.latitude || 0, user?.longitude || 0]
    );
    created++;
  }

  console.log('🌱 Seeded ' + created + ' demo items (PostgreSQL)');
  res.json({ success: true, message: `تم إنشاء ${created} منتج تجريبي ✅`, seeded: true });
});

// ---- Socket.io Events ----
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 ${socket.id} joined user_${userId}`);
  });

  socket.on('join_trade', (tradeRequestId) => {
    socket.join(`trade_${tradeRequestId}`);
    console.log(`👤 ${socket.id} joined trade_${tradeRequestId}`);
  });

  socket.on('leave_trade', (tradeRequestId) => {
    socket.leave(`trade_${tradeRequestId}`);
  });

  socket.on('typing', (data) => {
    socket.to(`trade_${data.tradeRequestId}`).emit('user_typing', {
      userId: data.userId,
      name: data.name
    });
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

// ---- Error Handling ----
app.use(notFound);
app.use(errorHandler);

// ---- Start Server ----
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║                                          ║');
  console.log('  ║   🔄  قايض - Qayed API Server  🔄       ║');
  console.log('  ║       منصة المقايضة الذكية               ║');
  console.log('  ║                                          ║');
  console.log(`  ║   🌐  http://localhost:${PORT}              ║`);
  console.log(`  ║   📋  http://localhost:${PORT}/api/v1        ║`);
  console.log('  ║                                          ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;

})(); // end async IIFE
