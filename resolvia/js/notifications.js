/* ============================================================
   Resolvia — Notifications Module
   js/notifications.js — connected to notification_log table
   ============================================================ */

'use strict';

let notifPanelOpen = false;
let NOTIFS = [];

/* ── Fetch notifications from backend ── */
function loadNotifications() {
  const token = (typeof getToken === 'function') ? getToken() : (sessionStorage.getItem('rv_token') || '');
  if (!token) return;

  fetch(window.location.origin + '/api/notifications', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) return;
    NOTIFS = data.data || [];
    updateNotifBadge();
    if (notifPanelOpen) renderNotifList();
  })
  .catch(() => {});
}

/* ── Unread count ── */
function getUnreadCount() {
  return NOTIFS.filter(n => !n.is_read).length;
}

/* ── Update bell badge ── */
function updateNotifBadge() {
  const count = getUnreadCount();
  const badge = document.getElementById('notif-count');
  if (!badge) return;
  badge.textContent = count > 0 ? (count > 9 ? '9+' : count) : '';
  badge.style.display = count > 0 ? 'flex' : 'none';
}

/* ── Render the panel list ── */
function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (!NOTIFS.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">🔔</div>
        <div>You\'re all caught up!</div>
      </div>`;
    return;
  }

  list.innerHTML = NOTIFS.map(n => `
    <div class="notif-item ${!n.is_read ? 'unread' : ''}" data-id="${n.notif_id}"
         onclick="markOneNotifRead(${n.notif_id}, this)" style="cursor:pointer">
      <div class="notif-icon" style="background:rgba(26,79,160,.1)">${n.icon || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${(n.created_at || '').substring(0,16).replace('T',' ')}</div>
      </div>
    </div>`).join('');
}

/* ── Toggle panel ── */
function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;

  if (notifPanelOpen) {
    panel.classList.add('open');
    if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
    loadNotifications();
    renderNotifList();
  } else {
    panel.classList.remove('open');
  }
}

function closeNotifPanel() {
  notifPanelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
}

/* ── Mark one as read ── */
function markOneNotifRead(id, el) {
  const token = (typeof getToken === 'function') ? getToken() : (sessionStorage.getItem('rv_token') || '');
  if (!token || el.classList.contains('read-pending')) return;
  el.classList.remove('unread');
  el.classList.add('read-pending');

  fetch(window.location.origin + '/api/notifications/' + id + '/read', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(r => r.json())
  .then(() => {
    const n = NOTIFS.find(n => n.notif_id === id);
    if (n) n.is_read = true;
    updateNotifBadge();
  })
  .catch(() => {});
}

/* ── Mark all as read ── */
function markAllNotifsRead() {
  const token = (typeof getToken === 'function') ? getToken() : (sessionStorage.getItem('rv_token') || '');
  if (!token) return;

  fetch(window.location.origin + '/api/notifications/read-all', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      NOTIFS.forEach(n => n.is_read = true);
      updateNotifBadge();
      renderNotifList();
      if (typeof showToast === 'function') showToast('✅', 'All notifications marked as read');
    }
  })
  .catch(() => {});
}

/* ── Init — load and poll every 60s ── */
function initNotifications() {
  loadNotifications();
  setInterval(loadNotifications, 60000);
}
