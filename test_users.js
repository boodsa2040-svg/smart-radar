const DATA = {
  users: [
    {"id":"6cbf1cc9-65ab-432e-a4f4-cc79e954a05e","name":null,"phone":"0599059937","email":null,"city":"","trust_score":5,"created_at":"2026-04-21 09:29:54","items_count":0},
    {"id":"8f41e88d-5db6-4383-857f-c66918fbf23f","name":"نورة السليمان","phone":"0533333333","email":null,"city":"الدمام","trust_score":4.8,"created_at":"2026-04-20 16:47:47","items_count":2}
  ]
};

try {
  var rows = DATA.users.map(function(u, i) {
    return '<tr><td>' + (i+1) + '</td><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar">' + (u.name||'؟')[0] + '</div><strong>' + u.name + '</strong></div></td><td>📍 ' + u.city + '</td><td>⭐ ' + u.trust_score + '</td><td>' + u.items_count + '</td><td><span class="badge-status badge-active">نشط</span></td><td><button class="action-btn" onclick="viewUser(\'' + u.id + '\')">👁 عرض</button> <button class="action-btn danger" onclick="deleteUser(\'' + u.id + '\')">🚫 حظر</button></td></tr>';
  }).join('');
  console.log('SUCCESS');
} catch (e) {
  console.error("ERROR", e);
}
