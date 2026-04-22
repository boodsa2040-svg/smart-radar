const API = window.location.origin + '/api/v1';
let DATA = { users: [], items: [], trades: [], stats: {} };

// ---- Fetch Data ----
async function fetchAll() {
  try {
    const [dbUsers, dbItems, dbTrades, dbHealth] = await Promise.all([
      fetch(API + '/admin/users').then(r => r.json()),
      fetch(API + '/admin/items').then(r => r.json()),
      fetch(API + '/admin/trades').then(r => r.json()),
      fetch(API + '/health').then(r => r.json())
    ]);

    DATA.users = dbUsers.data || [];
    DATA.items = dbItems.data || [];
    DATA.trades = dbTrades.data || [];
    DATA.stats.uptime = dbHealth.uptime;

    document.getElementById('users-count').textContent = DATA.users.length;
    document.getElementById('items-count').textContent = DATA.items.length;
    document.getElementById('trades-count').textContent = DATA.trades.length;
  } catch (e) { console.error('Fetch error:', e); }
}

function showPage(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  try {
    if (typeof event !== 'undefined' && event.target) {
      var btn = event.target.closest('.nav-item');
      if (btn) btn.classList.add('active');
    }
  } catch(e) {}
  var pages = {
    dashboard: renderDashboard, users: renderUsers, items: renderItems,
    trades: renderTrades, categories: renderCategories, reports: renderReports,
    notifications: renderNotifications, settings: renderSettings, logs: renderLogs,
  };
  (pages[page] || renderDashboard)();
}

function renderDashboard() {
  var cats = {};
  DATA.items.forEach(function(i) { cats[i.category] = (cats[i.category] || 0) + 1; });
  var totalValue = DATA.items.reduce(function(s, i) { return s + (i.estimated_value || 0); }, 0);
  var avgValue = DATA.items.length ? Math.round(totalValue / DATA.items.length) : 0;
  var citiesSet = {};
  DATA.items.forEach(function(i) { var c = i.city || i.owner_city; if (c) citiesSet[c] = true; });
  var cities = Object.keys(citiesSet);

  var catBars = Object.keys(cats).map(function(k) {
    var v = cats[k];
    var maxV = Math.max.apply(null, Object.values(cats));
    return '<div class="chart-col" style="height:' + (v/maxV)*100 + '%"><div class="tip">' + v + '</div><div class="lbl">' + k + '</div></div>';
  }).join('');

  var citiesHtml = cities.map(function(c) {
    var count = DATA.items.filter(function(i) { return (i.city||i.owner_city) === c; }).length;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2)"><span style="font-size:0.85rem;font-weight:600">📍 ' + c + '</span><span style="font-size:0.78rem;color:var(--primary);font-weight:700">' + count + ' منتج</span></div>';
  }).join('');

  var recentHtml = DATA.items.slice(0, 5).map(function(i) {
    return '<tr><td><strong>' + i.title + '</strong></td><td><span class="badge-status badge-active">' + i.category + '</span></td><td style="color:var(--primary);font-weight:700">~' + i.estimated_value + ' ر.س</td><td>' + (i.owner_name||'---') + '</td><td>📍 ' + (i.city||i.owner_city||'---') + '</td></tr>';
  }).join('');

  document.getElementById('main-content').innerHTML =
    '<div class="header"><div><h2>📊 لوحة التحكم</h2><div style="font-size:0.82rem;color:var(--text3);margin-top:2px">مرحباً بك في لوحة تحكم قايض</div></div><div class="header-right"><button class="header-btn" onclick="fetchAll().then(function(){showPage(\'dashboard\')})">🔄 تحديث</button><button class="header-btn primary" onclick="showPage(\'items\')">إدارة المنتجات</button></div></div>' +
    '<div class="stats"><div class="stat-card"><div class="icon">👥</div><div class="value">' + DATA.users.length + '</div><div class="label">مستخدم مسجّل</div><div class="change up">↑ 12% هذا الأسبوع</div></div><div class="stat-card"><div class="icon">📦</div><div class="value">' + DATA.items.length + '</div><div class="label">منتج متاح</div><div class="change up">↑ 8 منتجات جديدة</div></div><div class="stat-card"><div class="icon">🤝</div><div class="value">' + (DATA.trades.length||0) + '</div><div class="label">مقايضة</div><div class="change up">↑ 3 اليوم</div></div><div class="stat-card"><div class="icon">💰</div><div class="value">' + (totalValue/1000).toFixed(1) + 'K</div><div class="label">إجمالي القيمة (ر.س)</div><div class="change up">متوسط ' + avgValue + ' ر.س</div></div></div>' +
    '<div class="charts-grid"><div class="card"><div class="card-header"><h3>📊 المنتجات حسب التصنيف</h3></div><div style="padding:24px 20px 36px"><div class="chart-bar">' + (catBars||'لا توجد بيانات') + '</div></div></div><div class="card"><div class="card-header"><h3>🌍 التغطية الجغرافية</h3></div><div style="padding:20px">' + citiesHtml + '<div style="margin-top:16px;text-align:center;color:var(--text3);font-size:0.75rem">' + cities.length + ' مدن نشطة</div></div></div></div>' +
    '<div class="card"><div class="card-header"><h3>⏱ آخر المنتجات المضافة</h3><div class="actions"><button class="header-btn" onclick="showPage(\'items\')">عرض الكل →</button></div></div><table><tr><th>المنتج</th><th>التصنيف</th><th>القيمة</th><th>المالك</th><th>المدينة</th></tr>' + recentHtml + '</table></div>';
}

function renderUsers() {
  var rows = DATA.users.map(function(u, i) {
    var n = u.name || 'مجهول';
    var c = u.city || 'غير محدد';
    var phone = u.phone || '---';
    var email = u.email || '---';
    var date = u.created_at ? u.created_at.split(' ')[0] : '---';
    return '<tr><td>' + (i+1) + '</td><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar">' + n[0] + '</div><strong>' + n + '</strong></div></td><td style="direction:ltr;text-align:center">📱 ' + phone + '</td><td style="font-size:0.75rem">' + email + '</td><td>📍 ' + c + '</td><td>' + (u.items_count||0) + '</td><td style="font-size:0.75rem;color:var(--text3)">' + date + '</td><td><span class="badge-status badge-active">نشط</span></td><td><button class="action-btn" onclick="viewUser(\'' + u.id + '\')">👁 عرض</button> <button class="action-btn danger" onclick="deleteUser(\'' + u.id + '\')">🚫 حظر</button></td></tr>';
  }).join('');
  document.getElementById('main-content').innerHTML =
    '<div class="header"><h2>👥 إدارة المستخدمين</h2><div class="header-right"><input class="search-input" placeholder="🔍 البحث عن مستخدم..." oninput="filterUsers(this.value)"></div></div>' +
    '<div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat-card"><div class="icon">👥</div><div class="value">' + DATA.users.length + '</div><div class="label">إجمالي المستخدمين</div></div><div class="stat-card"><div class="icon">✅</div><div class="value">' + DATA.users.length + '</div><div class="label">حسابات موثّقة</div></div><div class="stat-card"><div class="icon">📦</div><div class="value">' + DATA.items.length + '</div><div class="label">إجمالي المنتجات</div></div></div>' +
    '<div class="card"><div class="card-header"><h3>قائمة المستخدمين</h3></div><table id="users-table"><tr><th>#</th><th>المستخدم</th><th>الجوال</th><th>الإيميل</th><th>المدينة</th><th>المنتجات</th><th>تاريخ التسجيل</th><th>الحالة</th><th>إجراءات</th></tr>' + rows + '</table></div>';
}

function filterUsers(q) {
  document.querySelectorAll('#users-table tr:not(:first-child)').forEach(function(r) { r.style.display = r.textContent.includes(q) ? '' : 'none'; });
}

function viewUser(id) {
  var u = DATA.users.find(function(x) { return x.id === id; });
  if (!u) return;
  var items = DATA.items.filter(function(i) { return i.user_id === id; });
  var itemsHtml = items.map(function(i) { return '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg3);border-radius:8px;margin-bottom:4px;font-size:0.82rem"><span>' + i.title + '</span><span style="color:var(--primary)">~' + i.estimated_value + ' ر.س</span></div>'; }).join('');
  var date = u.created_at ? u.created_at.split(' ')[0] : '---';
  var infoRows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
    '<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">📱 الجوال</div><div style="font-size:0.82rem;font-weight:700;direction:ltr">' + (u.phone||'---') + '</div></div>' +
    '<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">📧 الإيميل</div><div style="font-size:0.78rem;font-weight:600;word-break:break-all">' + (u.email||'---') + '</div></div>' +
    '<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">📅 تاريخ التسجيل</div><div style="font-size:0.82rem;font-weight:700">' + date + '</div></div>' +
    '<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">⭐ التقييم</div><div style="font-size:0.82rem;font-weight:700;color:var(--primary)">' + (u.trust_score||5) + '</div></div>' +
    '</div>';
  showModal('<h3>👤 ملف المستخدم</h3><div style="text-align:center;margin-bottom:16px"><div class="avatar" style="width:60px;height:60px;font-size:1.5rem;margin:0 auto 8px">' + (u.name||'؟')[0] + '</div><div style="font-weight:800;font-size:1.1rem">' + u.name + '</div><div style="color:var(--text3);font-size:0.82rem">📍 ' + (u.city||'غير محدد') + '</div></div>' + infoRows + '<div style="font-weight:700;margin-bottom:8px">📦 منتجات المستخدم (' + items.length + ')</div>' + itemsHtml + '<div class="modal-actions"><button class="header-btn" onclick="closeModal()" style="width:100%">إغلاق</button></div>');
}

function renderItems() {
  var catTabs = [];
  var seen = {};
  DATA.items.forEach(function(i) { if (!seen[i.category]) { seen[i.category] = true; catTabs.push(i.category); } });
  var tabsHtml = '<button class="tab active" onclick="filterItemsCat(this,\'all\')">الكل</button>' + catTabs.map(function(c) { return '<button class="tab" onclick="filterItemsCat(this,\'' + c + '\')">' + c + '</button>'; }).join('');
  var rows = DATA.items.map(function(item, i) {
    return '<tr data-cat="' + item.category + '"><td>' + (i+1) + '</td><td><strong>' + item.title + '</strong><div style="font-size:0.7rem;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (item.description||'') + '</div></td><td><span class="badge-status badge-active">' + item.category + '</span></td><td><span class="badge-status badge-pending">' + (item.condition||'---') + '</span></td><td style="color:var(--primary);font-weight:800">~' + item.estimated_value + ' ر.س</td><td>' + (item.owner_name||'---') + '</td><td>📍 ' + (item.city||item.owner_city||'---') + '</td><td><button class="action-btn" onclick="editItem(\'' + item.id + '\')">✏️</button> <button class="action-btn danger" onclick="deleteItem(\'' + item.id + '\')">🗑</button></td></tr>';
  }).join('');
  document.getElementById('main-content').innerHTML =
    '<div class="header"><h2>📦 إدارة المنتجات</h2><div class="header-right"><input class="search-input" placeholder="🔍 البحث عن منتج..." oninput="filterItems(this.value)"></div></div>' +
    '<div class="card"><div class="card-header"><h3>جميع المنتجات (' + DATA.items.length + ')</h3><div class="tabs">' + tabsHtml + '</div></div><table id="items-table"><tr><th>#</th><th>المنتج</th><th>التصنيف</th><th>الحالة</th><th>القيمة</th><th>المالك</th><th>المدينة</th><th>إجراءات</th></tr>' + rows + '</table></div>';
}

function filterItems(q) { document.querySelectorAll('#items-table tr:not(:first-child)').forEach(function(r) { r.style.display = r.textContent.includes(q) ? '' : 'none'; }); }
function filterItemsCat(btn, cat) { document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); }); btn.classList.add('active'); document.querySelectorAll('#items-table tr:not(:first-child)').forEach(function(r) { r.style.display = (cat === 'all' || r.dataset.cat === cat) ? '' : 'none'; }); }

function editItem(id) {
  var item = DATA.items.find(function(i) { return i.id === id; });
  if (!item) return;
  showModal('<h3>✏️ تعديل المنتج</h3><div class="form-group"><label>اسم المنتج</label><input value="' + item.title + '" id="edit-title"></div><div class="form-group"><label>الوصف</label><textarea id="edit-desc">' + (item.description||'') + '</textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label>التصنيف</label><input value="' + item.category + '" id="edit-cat"></div><div class="form-group"><label>الحالة</label><input value="' + item.condition + '" id="edit-cond"></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label>القيمة (ر.س)</label><input type="number" value="' + item.estimated_value + '" id="edit-val"></div><div class="form-group"><label>المدينة</label><input value="' + (item.city||'') + '" id="edit-city"></div></div><div class="modal-actions"><button class="header-btn" onclick="closeModal()">إلغاء</button><button class="header-btn primary" onclick="saveItem(\'' + id + '\')">💾 حفظ</button></div>');
}

function deleteItem(id) { if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return; fetch(API + '/admin/items/' + id, { method: 'DELETE' }).then(function() { fetchAll().then(renderItems); }).catch(function() { alert('خطأ'); }); }
function deleteUser(id) { if (!confirm('سيتم حذف المستخدم وكل منتجاته، متأكد؟')) return; fetch(API + '/admin/users/' + id, { method: 'DELETE' }).then(function() { fetchAll().then(renderUsers); }).catch(function() { alert('خطأ'); }); }
function saveItem(id) {
  var data = {
    title: document.getElementById('edit-title').value,
    description: document.getElementById('edit-desc').value,
    category: document.getElementById('edit-cat').value,
    condition: document.getElementById('edit-cond').value,
    estimated_value: parseFloat(document.getElementById('edit-val').value)||0,
    city: document.getElementById('edit-city').value
  };
  fetch(API + '/admin/items/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function() { closeModal(); fetchAll().then(renderItems); }).catch(function() { alert('خطأ'); });
}
function showAddItemModal() { showModal('<h3>➕ إضافة منتج جديد</h3><div class="form-group"><label>اسم المنتج *</label><input id="new-title" placeholder="اسم المنتج"></div><div class="form-group"><label>الوصف</label><textarea id="new-desc" placeholder="وصف تفصيلي..."></textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label>التصنيف</label><select id="new-cat"><option>إلكترونيات</option><option>هواتف</option><option>كاميرات</option><option>ساعات</option><option>ألعاب</option><option>كتب</option><option>رياضة</option><option>أثاث</option><option>أخرى</option></select></div><div class="form-group"><label>الحالة</label><select id="new-cond"><option>جديد</option><option>ممتاز</option><option>جيد جداً</option><option>جيد</option><option>مستعمل</option></select></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label>القيمة (ر.س)</label><input type="number" id="new-val" placeholder="500"></div><div class="form-group"><label>المدينة</label><input id="new-city" placeholder="الرياض"></div></div><div class="modal-actions"><button class="header-btn" onclick="closeModal()">إلغاء</button><button class="header-btn primary" onclick="addNewItem()">✅ إضافة</button></div>'); }

function renderTrades() {
  var rows = DATA.trades.map(function(t, i) {
    var statusClass = t.status === 'pending' ? 'badge-pending' : t.status === 'accepted' ? 'badge-active' : 'badge-blocked';
    var statusTxt = t.status === 'pending' ? 'قيد الانتظار' : t.status === 'accepted' ? 'مقبول' : 'مرفوض';
    return '<tr><td>' + (i+1) + '</td><td><strong>' + (t.requester_name||'مجهول') + '</strong></td><td>' + (t.offered_item_title||'منتج محذوف') + '</td><td style="color:var(--primary);font-weight:bold">↔️</td><td>' + (t.wanted_item_title||'منتج محذوف') + '</td><td><strong>' + (t.receiver_name||'مجهول') + '</strong></td><td><span class="badge-status ' + statusClass + '">' + statusTxt + '</span></td><td>' + t.created_at.split('T')[0] + '</td></tr>';
  }).join('');
  
  var pendingCount = DATA.trades.filter(function(t) { return t.status === 'pending'; }).length;
  var acceptedCount = DATA.trades.filter(function(t) { return t.status === 'accepted'; }).length;
  var rejectedCount = DATA.trades.filter(function(t) { return t.status === 'rejected'; }).length;

  var tableHtml = DATA.trades.length ? ('<table><tr><th>#</th><th>المرسل</th><th>المنتج المعروض</th><th></th><th>المنتج المطلوب</th><th>المستقبل</th><th>الحالة</th><th>التاريخ</th></tr>' + rows + '</table>') : '<div style="padding:40px;text-align:center;color:var(--text3)"><div style="font-size:3rem;margin-bottom:12px">🤝</div><div style="font-weight:700">لا توجد مقايضات بعد</div></div>';

  document.getElementById('main-content').innerHTML = '<div class="header"><h2>🤝 إدارة المقايضات</h2></div><div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat-card"><div class="icon">📥</div><div class="value">' + pendingCount + '</div><div class="label">طلبات واردة (انتظار)</div></div><div class="stat-card"><div class="icon">✅</div><div class="value">' + acceptedCount + '</div><div class="label">مقايضات ناجحة</div></div><div class="stat-card"><div class="icon">❌</div><div class="value">' + rejectedCount + '</div><div class="label">مرفوضة</div></div></div><div class="card"><div class="card-header"><h3>سجل المقايضات (' + DATA.trades.length + ')</h3></div>' + tableHtml + '</div>';
}

function renderCategories() {
  var cats = {};
  DATA.items.forEach(function(i) { cats[i.category] = (cats[i.category] || 0) + 1; });
  var rows = Object.keys(cats).map(function(cat, i) {
    var count = cats[cat];
    var pct = DATA.items.length ? Math.round(count/DATA.items.length*100) : 0;
    return '<tr><td>' + (i+1) + '</td><td><strong>' + cat + '</strong></td><td>' + count + '</td><td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:var(--border2);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--gradient);border-radius:99px"></div></div><span style="font-size:0.75rem;color:var(--primary);font-weight:700">' + pct + '%</span></div></td><td><button class="action-btn">✏️ تعديل</button></td></tr>';
  }).join('');
  document.getElementById('main-content').innerHTML = '<div class="header"><h2>📁 إدارة التصنيفات</h2></div><div class="card"><div class="card-header"><h3>التصنيفات النشطة</h3></div><table><tr><th>#</th><th>التصنيف</th><th>عدد المنتجات</th><th>النسبة</th><th>إجراءات</th></tr>' + rows + '</table></div>';
}

function renderReports() {
  var totalVal = DATA.items.reduce(function(s,i) { return s + (i.estimated_value||0); }, 0);
  var citiesCount = Object.keys(DATA.items.reduce(function(acc,i) { var c = i.city||i.owner_city; if(c) acc[c]=1; return acc; }, {})).length;
  var topItems = DATA.items.slice().sort(function(a,b) { return (b.estimated_value||0)-(a.estimated_value||0); }).slice(0,5);
  var topHtml = topItems.map(function(i,idx) { return '<tr><td>' + (idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':idx+1) + '</td><td><strong>' + i.title + '</strong></td><td style="color:var(--primary);font-weight:800">' + i.estimated_value + ' ر.س</td><td>' + (i.owner_name||'---') + '</td></tr>'; }).join('');
  document.getElementById('main-content').innerHTML = '<div class="header"><h2>📈 التقارير والإحصائيات</h2></div><div class="stats"><div class="stat-card"><div class="icon">💰</div><div class="value">' + totalVal.toLocaleString() + '</div><div class="label">إجمالي قيمة المنتجات</div></div><div class="stat-card"><div class="icon">📊</div><div class="value">' + (DATA.items.length?Math.round(totalVal/DATA.items.length):0) + '</div><div class="label">متوسط قيمة المنتج</div></div><div class="stat-card"><div class="icon">🏙️</div><div class="value">' + citiesCount + '</div><div class="label">مدن نشطة</div></div><div class="stat-card"><div class="icon">⏱️</div><div class="value">' + (DATA.stats.uptime?Math.round(DATA.stats.uptime/60)+'د':'---') + '</div><div class="label">وقت التشغيل</div></div></div><div class="card"><div class="card-header"><h3>📋 أعلى المنتجات قيمة</h3></div><table><tr><th>#</th><th>المنتج</th><th>القيمة</th><th>المالك</th></tr>' + topHtml + '</table></div>';
}

function renderNotifications() { document.getElementById('main-content').innerHTML = '<div class="header"><h2>🔔 إدارة الإشعارات</h2><div class="header-right"><button class="header-btn primary" onclick="showSendNotifModal()">📤 إرسال إشعار</button></div></div><div class="card"><div class="card-header"><h3>الإشعارات المرسلة</h3></div><table><tr><th>النوع</th><th>العنوان</th><th>المستلمون</th><th>التاريخ</th></tr><tr><td>📢 عام</td><td>مرحباً بكم في قايض!</td><td>جميع المستخدمين</td><td>اليوم</td></tr><tr><td>🎉 ترقية</td><td>ميزة الاكتشاف الجديدة</td><td>جميع المستخدمين</td><td>أمس</td></tr></table></div>'; }
function showSendNotifModal() { showModal('<h3>📤 إرسال إشعار</h3><div class="form-group"><label>العنوان</label><input placeholder="عنوان الإشعار"></div><div class="form-group"><label>المحتوى</label><textarea placeholder="اكتب محتوى الإشعار..."></textarea></div><div class="form-group"><label>المستلمون</label><select><option>جميع المستخدمين</option><option>المستخدمين النشطين</option><option>مستخدم محدد</option></select></div><div class="modal-actions"><button class="header-btn" onclick="closeModal()">إلغاء</button><button class="header-btn primary">📤 إرسال</button></div>'); }

function renderSettings() { document.getElementById('main-content').innerHTML = '<div class="header"><h2>⚙️ إعدادات النظام</h2></div><div class="card" style="padding:24px"><h3 style="margin-bottom:16px">🔧 إعدادات عامة</h3><div class="form-group"><label>اسم المنصة</label><input value="قايض - Qayed"></div><div class="form-group"><label>البريد الإلكتروني</label><input value="admin@qayed.app"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label>الحد الأقصى للمنتجات/مستخدم</label><input type="number" value="20"></div><div class="form-group"><label>نطاق البحث (كم)</label><input type="number" value="50"></div></div><h3 style="margin:20px 0 16px">🔐 الأمان</h3><div class="form-group"><label>الحد الأقصى لمحاولات الدخول</label><input type="number" value="5"></div><div class="form-group"><label>مدة الجلسة (ساعة)</label><input type="number" value="72"></div><button class="header-btn primary" style="margin-top:16px">💾 حفظ الإعدادات</button></div>'; }

function renderLogs() { document.getElementById('main-content').innerHTML = '<div class="header"><h2>📋 سجل النظام</h2></div><div class="card"><div class="card-header"><h3>آخر الأحداث</h3></div><table><tr><th>الوقت</th><th>الحدث</th><th>المستخدم</th></tr><tr><td style="color:var(--text3)">منذ دقيقة</td><td>👤 تسجيل دخول جديد</td><td>مستخدم تجريبي</td></tr><tr><td style="color:var(--text3)">منذ 5 دقائق</td><td>📦 إضافة منتج</td><td>سارة الأحمد</td></tr><tr><td style="color:var(--text3)">منذ 10 دقائق</td><td>🔄 تحديث بيانات</td><td>النظام</td></tr><tr><td style="color:var(--text3)">منذ 30 دقيقة</td><td>🌱 بذر بيانات تجريبية</td><td>النظام</td></tr><tr><td style="color:var(--text3)">منذ ساعة</td><td>🚀 تشغيل السيرفر</td><td>النظام</td></tr></table></div>'; }

function showModal(html) { document.getElementById('modal-content').innerHTML = html; document.getElementById('modal').classList.add('show'); }
function closeModal() { document.getElementById('modal').classList.remove('show'); }
document.getElementById('modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) closeModal(); });

// Init
fetchAll().then(function() { renderDashboard(); }).catch(function(e) { console.error(e); renderDashboard(); });
