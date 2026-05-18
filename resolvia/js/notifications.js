/* ============================================================
   Resolvia — Notifications Module
   js/notifications.js
   ============================================================ */

'use strict';

/* ── Notification store ── */
let NOTIFS = [
  { id:1, type:'ticket',   icon:'🎫', msg:'New complaint submitted by Acme Corp', sub:'RV-1001 · Billing Dispute', time:'2 min ago',  unread:true,  ref:'RV-1001' },
  { id:2, type:'assign',   icon:'👤', msg:'RV-1002 assigned to Jon D.',           sub:'Technical Issue · TechFlow',  time:'8 min ago',  unread:true,  ref:'RV-1002' },
  { id:3, type:'resolved', icon:'✅', msg:'RV-1003 marked as Resolved',           sub:'Kaira Fiala · General Inquiry',time:'21 min ago', unread:true,  ref:'RV-1003' },
  { id:4, type:'ticket',   icon:'🎫', msg:'New complaint from Commerce Ltd',      sub:'RV-1004 · Billing Dispute',   time:'1 hr ago',   unread:false, ref:'RV-1004' },
  { id:5, type:'alert',    icon:'⚠️', msg:'5 tickets pending for over 48 hours',  sub:'Action required by admin',    time:'2 hr ago',   unread:false, ref:null      },
  { id:6, type:'resolved', icon:'✅', msg:'RV-1005 resolved by Eaven R.',         sub:'Kala Radia · Service Quality', time:'3 hr ago',   unread:false, ref:'RV-1005' },
  { id:7, type:'assign',   icon:'👤', msg:'RV-1006 auto-assigned to Ana F.',      sub:'Technical Issue · Nova Systems',time:'4 hr ago',  unread:false, ref:'RV-1006' },
  { id:8, type:'alert',    icon:'📊', msg:'Monthly report is ready to view',      sub:'March 2025 summary',           time:'1 day ago',  unread:false, ref:null      },
];

let notifPanelOpen    = false;

/* ── Unread count ── */
function getUnreadCount() {
  return NOTIFS.filter(n => n.unread).length;
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
        <div>You're all caught up!</div>
      </div>`;
    return;
  }

  const iconBg = { ticket:'rgba(26,79,160,.1)', assign:'rgba(109,40,217,.1)', resolved:'rgba(21,128,61,.1)', alert:'rgba(185,28,28,.1)' };

  list.innerHTML = NOTIFS.map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}"
      onclick="handleNotifClick(${n.id})"
      data-id="${n.id}">
      <div class="notif-icon" style="background:${iconBg[n.type] || 'var(--surface3)'}">
        ${n.icon}
      </div>
      <div class="notif-body">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-sub">${n.sub}</div>
        <div class="notif-time">${n.time}</div>
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
    // Close settings if open
    closeSettingsPanel();
    renderNotifList();
  } else {
    panel.classList.remove('open');
  }
}

function closeNotifPanel() {
  notifPanelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
}

/* ── Click a notification ── */
function handleNotifClick(id) {
  const n = NOTIFS.find(x => x.id === id);
  if (!n) return;

  // Mark as read
  n.unread = false;
  updateNotifBadge();

  // If linked to a ticket, navigate there
  if (n.ref) {
    closeNotifPanel();
    if (typeof staffNav === 'function') {
      staffNav('mytickets');
      setTimeout(() => {
        if (typeof staffOpenTicket === 'function') staffOpenTicket(n.ref);
      }, 250);
    } else if (typeof nav === 'function') {
      nav('tickets');
      setTimeout(() => {
        if (typeof openTicket === 'function') openTicket(n.ref);
      }, 250);
    }
  }

  // Re-render
  renderNotifList();
}

/* ── Mark all as read ── */
function markAllNotifsRead() {
  NOTIFS.forEach(n => n.unread = false);
  updateNotifBadge();
  renderNotifList();
  if (typeof showToast === 'function') showToast('✅', 'All notifications marked as read');
}

/* ── Add a new notification programmatically ── */
function addNotif(type, icon, msg, sub, ref = null) {
  const id = Date.now();
  NOTIFS.unshift({ id, type, icon, msg, sub, time: 'Just now', unread: true, ref });
  updateNotifBadge();
  if (notifPanelOpen) renderNotifList();
}

/* ── Init ── */
function initNotifications() {
  updateNotifBadge();
}
