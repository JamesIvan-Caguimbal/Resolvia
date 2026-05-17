/* ============================================================
   Resolvia — Application Logic
   js/app.js
   All data, navigation, and feature functions
   ============================================================ */

'use strict';
const API = window.location.origin + '/api';

/* ── Token helper ─────────────────────────────────────────── */
function getToken() { return sessionStorage.getItem('rv_token') || ''; }
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

/* ── Pagination state ─────────────────────────────────────── */
let curPage = 1;
const PER   = 10;

/* ── In-memory ticket cache (loaded from API) ─────────────── */
let DB       = [];
let filtered = [];
let openRef  = null;

/* ── Routing map (kept for submit page routing tag display) ── */
let ROUTING   = {};
let ALL_TYPES = [];
let ALL_DEPTS = [];

/* Load complaint types from API on page load */
function loadLookups() {
  fetch(`${API}/lookup/complaint-types`)
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      ALL_TYPES = data.data.map(r => r.type_name);
      data.data.forEach(r => { ROUTING[r.type_name] = r.routing_dept; });
      ALL_DEPTS = [...new Set(data.data.map(r => r.routing_dept))];
    })
    .catch(() => {});
}

/* ════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════ */
function nav(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('p-' + id);
  if (page) page.classList.add('active');

  const navEl = document.querySelector(`[data-nav="${id}"]`);
  if (navEl) navEl.classList.add('active');

  if (id === 'dashboard') refreshDash();
  if (id === 'tickets')   loadTickets();
  if (id === 'resolve')   loadResolveTickets();
  if (id === 'reports')   renderReports();
  if (id === 'ratings')   renderRatingsPage();
  if (id === 'staff')     loadStaff();
  if (id === 'mytickets') loadMyTickets();

  updateBadges();
}

function updateBadges() {
  const openCount = DB.filter(t => t.status !== 'Resolved').length;
  setText('nb-tickets', DB.length);
  setText('nb-open',    openCount);
}


/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
function refreshDash() {
  const token = getToken();
  if (!token) return;

  /* Dashboard shows ALL complaints */
  fetch(`${API}/complaints/all?limit=200`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      DB = data.data;

      const total    = DB.length;
      const resolved = DB.filter(t => t.status === 'Resolved').length;
      const inProg   = DB.filter(t => t.status === 'In Progress').length;
      const pending  = DB.filter(t => t.status === 'Pending').length;

      animCount('s-total', total);
      animCount('s-res',   resolved);
      animCount('s-prog',  inProg);
      animCount('s-pend',  pending);

      drawBarChart(total, resolved, inProg, pending);
      drawDonut(resolved, inProg, pending);
      renderRecent();
      updateBadges();
    })
    .catch(() => {});
}
function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.ceil(target / 18);
  const timer = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(timer);
  }, 40);
}

function drawBarChart(total, res, prog, pend) {
  const maxV = Math.max(total, 1);
  const bars = [
    { l:'Total',       v:total, c:'var(--accent)'  },
    { l:'Resolved',    v:res,   c:'var(--green)'   },
    { l:'In Progress', v:prog,  c:'var(--blue)'    },
    { l:'Pending',     v:pend,  c:'var(--yellow)'  }
  ];
  const wrap = document.getElementById('bar-chart');
  if (!wrap) return;
  wrap.innerHTML = bars.map(b => `
    <div class="bg">
      <div class="bv">${b.v}</div>
      <div class="b" style="height:${Math.round((b.v / maxV) * 90)}%;background:${b.c};opacity:.82"
           title="${b.l}: ${b.v}"></div>
      <div class="bl">${b.l}</div>
    </div>`).join('');
}

function drawDonut(res, prog, pend) {
  const total = (res + prog + pend) || 1;
  const r = 36, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  const slices = [
    { v:res,  c:'#22c55e', n:'Resolved'    },
    { v:prog, c:'#3b82f6', n:'In Progress' },
    { v:pend, c:'#f59e0b', n:'Pending'     }
  ];
  let off = 0;
  const paths = slices.map(s => {
    const pct  = s.v / total;
    const dash = pct * circ;
    const p = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}"
      stroke-width="14" stroke-dasharray="${dash} ${circ - dash}"
      stroke-dashoffset="${-off * circ}"
      transform="rotate(-90 ${cx} ${cy})" opacity=".88"/>`;
    off += pct;
    return p;
  });

  const svg = document.getElementById('donut');
  if (svg) {
    svg.innerHTML = paths.join('')
      + `<circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="var(--surface)"/>`
      + `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="var(--txt)"
           font-size="13" font-weight="bold" font-family="Bricolage Grotesque,sans-serif">${total}</text>`;
  }

  const leg = document.getElementById('dlegend');
  if (leg) {
    leg.innerHTML = slices.map(s => `
      <div class="dl-item">
        <div class="dl-dot" style="background:${s.c}"></div>
        <span class="dl-name">${s.n}</span>
        <span class="dl-val">${s.v}</span>
      </div>`).join('');
  }
}

function renderRecent() {
  const tb = document.getElementById('recent-tb');
  if (!tb) return;
  tb.innerHTML = DB.slice(0, 6).map(t => `
    <tr>
      <td><span class="ref-id" onclick="openTicket('${t.ref_number}')">${t.ref_number}</span></td>
      <td style="color:var(--txt)">${t.customer_name}</td>
      <td>${t.complaint_type}</td>
      <td><span class="pill ${pillCls(t.status)}">${t.status}</span></td>
      <td>
        <div class="asgn">
          <div class="asgn-av">${ini(t.assigned_to || 'UN')}</div>${t.assigned_to || 'Unassigned'}
        </div>
      </td>
    </tr>`).join('');
}


/* ════════════════════════════════════════════════════════════
   ALL TICKETS
════════════════════════════════════════════════════════════ */
function loadTickets() {
  const token = getToken();
  if (!token) return;

  const status   = document.getElementById('f-status')?.value   || '';
  const type     = document.getElementById('f-type')?.value     || '';
  const priority = document.getElementById('f-priority')?.value || '';
  const search   = document.getElementById('f-search')?.value   || '';

    let url = `${API}/complaints/all?limit=200`;
  if (status)   url += `&status=${encodeURIComponent(status)}`;
  if (type)     url += `&type=${encodeURIComponent(type)}`;
  if (priority) url += `&priority=${encodeURIComponent(priority)}`;
  if (search)   url += `&search=${encodeURIComponent(search)}`;

  fetch(url, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      DB       = data.data;
      filtered = [...DB];
      curPage  = 1;
      renderTickets();
      updateBadges();
    })
    .catch(() => showToast('⚠️', 'Could not load tickets.'));
}

function applyFilters() { loadTickets(); }

function setFilter(status) {
  const el = document.getElementById('f-status');
  if (el) { el.value = status; loadTickets(); }
}

function clearFilters() {
  ['f-search','f-status','f-type','f-priority'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
  loadTickets();
}

function renderTickets() {
  const tb = document.getElementById('tkt-tbody');
  if (!tb) return;
  const start = (curPage - 1) * PER;
  const page  = filtered.slice(start, start + PER);

  tb.innerHTML = page.map(t => `
    <tr>
      <td><span class="ref-id" onclick="openTicket('${t.ref_number}')">${t.ref_number}</span></td>
      <td>${fmtDate(t.submitted_date)}</td>
      <td style="color:var(--txt);font-weight:500">${t.customer_name}</td>
      <td>${t.complaint_type}</td>
      <td><span class="pill pri-pill ${priorityCls(t.priority)}">${priorityIcon(t.priority)} ${t.priority}</span></td>
      <td><span class="pill ${pillCls(t.status)}">${t.status}</span></td>
      <td>
        <div class="asgn">
          <div class="asgn-av">${ini(t.assigned_to || 'UN')}</div>${t.assigned_to || 'Unassigned'}
        </div>
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openTicket('${t.ref_number}')">Open →</button>
      </td>
    </tr>`).join('');

  renderPag();
}

function renderPag() {
  const total = filtered.length;
  const pages = Math.ceil(total / PER);
  const start = Math.min((curPage - 1) * PER + 1, total);
  const end   = Math.min(curPage * PER, total);

  setText('pag-info', `Showing ${start}–${end} of ${total} tickets`);

  const btns = document.getElementById('pag-btns');
  if (!btns) return;
  let h = `<button class="pb" onclick="goPage(${curPage - 1})">‹</button>`;
  for (let i = 1; i <= pages; i++)
    h += `<button class="pb ${i === curPage ? 'on' : ''}" onclick="goPage(${i})">${i}</button>`;
  h += `<button class="pb" onclick="goPage(${curPage + 1})">›</button>`;
  btns.innerHTML = h;
}

function goPage(p) {
  const pages = Math.ceil(filtered.length / PER);
  if (p < 1 || p > pages) return;
  curPage = p;
  renderTickets();
}

function globalSearch(q) {
  const el = document.getElementById('f-search');
  if (el) el.value = q;
  if (!document.getElementById('p-tickets').classList.contains('active')) nav('tickets');
  loadTickets();
}


/* ════════════════════════════════════════════════════════════
   TICKET DETAIL PANEL
════════════════════════════════════════════════════════════ */
function openTicket(ref) {
  const token = getToken();
  if (!token) return;

  fetch(`${API}/complaints/${ref}`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) { showToast('⚠️', 'Ticket not found.'); return; }
      const t = data.data;
      openRef = ref;

      setText('pn-ref',   t.ref_number);
      setText('pn-cust',  t.customer_name);
      setText('pn-email', t.customer_email);
      setText('pn-type',  t.complaint_type);
      setText('pn-date',  fmtDate(t.submitted_date));
      setText('pn-asgn',  t.assigned_to || 'Unassigned');

      document.getElementById('pn-status-disp').innerHTML =
        `<span class="pill ${pillCls(t.status)}">${t.status}</span>`;
      document.getElementById('pn-desc').textContent   = t.description || t.subject || '';
      document.getElementById('pn-notes').value         = t.resolution_notes || '';

      document.querySelectorAll('.sbt').forEach(b =>
        b.classList.toggle('on', b.dataset.st === t.status));

      renderAuditFromAPI(t.audit_trail || []);
      renderRatingUI(t);

      document.getElementById('overlay').classList.add('open');
      document.getElementById('panel').classList.add('open');
    })
    .catch(() => showToast('⚠️', 'Could not load ticket.'));
}

function closePanel() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('panel').classList.remove('open');
  openRef = null;
}

function updateStatus(status) {
  if (!openRef) return;
  const token = getToken();

  fetch(`${API}/complaints/${openRef}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify({ status })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { /* silently reload to reset UI */ loadTickets(); return; }
    document.getElementById('pn-status-disp').innerHTML =
      `<span class="pill ${pillCls(status)}">${status}</span>`;
    document.querySelectorAll('.sbt').forEach(b =>
      b.classList.toggle('on', b.dataset.st === status));
    showToast('✅', `Ticket ${openRef} → "${status}"`);
    loadTickets();
    updateBadges();
    /* Reload audit trail */
    openTicket(openRef);
  })
  .catch(() => showToast('⚠️', 'Could not update status.'));
}

function saveNotes() {
  if (!openRef) return;
  const notes = document.getElementById('pn-notes').value;

  fetch(`${API}/complaints/${openRef}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify({ resolution_notes: notes })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showToast('⚠️', data.message || 'Save failed.'); return; }
    showToast('💾', 'Resolution notes saved');
  })
  .catch(() => showToast('⚠️', 'Could not save notes.'));
}

function renderAuditFromAPI(audit) {
  const el = document.getElementById('pn-audit');
  if (!el) return;
  el.innerHTML = audit.map((a, i) => `
    <div class="au-item">
      <div class="au-dot" style="background:${i === audit.length - 1 ? 'var(--green)' : 'var(--accent)'}"></div>
      <div>
        <div class="au-txt">${a.audit_entry}</div>
        <div style="font-size:11px;color:var(--txt3)">${a.recorded_at || ''}</div>
      </div>
    </div>`).join('');
}


/* ════════════════════════════════════════════════════════════
   SUBMIT COMPLAINT
════════════════════════════════════════════════════════════ */
function updateRoute() {
  const type = document.getElementById('c-type').value;
  const tag  = document.getElementById('route-tag');
  if (tag) {
    tag.textContent = ROUTING[type] || 'Select type first';
    tag.style.color = type ? 'var(--accent2)' : 'var(--txt3)';
  }
}

function submitComplaint() {
  const name     = document.getElementById('c-name').value.trim();
  const email    = document.getElementById('c-email').value.trim();
  const type     = document.getElementById('c-type').value;
  const subj     = document.getElementById('c-subj').value.trim();
  const desc     = document.getElementById('c-desc').value.trim();
  const priority = document.getElementById('c-priority')?.value || 'Medium';

  if (!name || !email || !type || !subj || !desc) {
    showToast('⚠️', 'Please fill in all required fields');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('⚠️', 'Please enter a valid email address');
    return;
  }

  fetch(`${API}/complaints`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      customer_name:  name,
      customer_email: email,
      type,
      subject:     subj,
      description: desc,
      priority
    })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showToast('⚠️', data.message || 'Submission failed.'); return; }

    const ref      = data.data.ref;
    const assigned = data.data.assigned_to || 'Auto-assigned';

    document.getElementById('sub-form-wrap').style.display = 'none';
    setText('suc-ref',    ref);
    setText('suc-assign', assigned);
    document.getElementById('sub-success').classList.add('show');

    updateBadges();
    showToast('🎉', `Complaint ${ref} submitted!`);
  })
  .catch(() => showToast('⚠️', 'Cannot connect to server. Make sure Flask is running.'));
}

function resetForm() {
  document.getElementById('sub-form-wrap').style.display = '';
  document.getElementById('sub-success').classList.remove('show');
  ['c-name','c-email','c-subj','c-desc'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
  const ct = document.getElementById('c-type');
  if (ct) ct.value = '';
  const tag = document.getElementById('route-tag');
  if (tag) tag.textContent = 'Select type first';
}


/* ════════════════════════════════════════════════════════════
   CUSTOMER TRACKING
════════════════════════════════════════════════════════════ */
function trackLookup() {
  const q   = (document.getElementById('track-in').value || '').trim();
  const res = document.getElementById('track-results');
  if (!q) { res.innerHTML = ''; return; }

  const token = getToken();
  const headers = token ? authHeaders() : { 'Content-Type': 'application/json' };

  fetch(`${API}/complaints?search=${encodeURIComponent(q)}`, { headers })
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.data.length) {
        res.innerHTML = `<p style="color:var(--txt3);text-align:center;font-size:13px;padding:16px 0">
          No complaints found for "<strong style="color:var(--txt)">${q}</strong>"
        </p>`;
        return;
      }

      res.innerHTML = data.data.map(t => `
        <div class="tr-item">
          <div>
            <div class="tr-ref">${t.ref_number}</div>
            <div class="tr-sub">${t.complaint_type} · ${fmtDate(t.submitted_date)} · Assigned: ${t.assigned_to || 'Unassigned'}</div>
          </div>
          <span class="pill ${pillCls(t.status)}">${t.status}</span>
        </div>`).join('');
    })
    .catch(() => {
      res.innerHTML = `<p style="color:var(--txt3);text-align:center;font-size:13px;padding:16px 0">
        Could not connect to server.
      </p>`;
    });
}

/* ════════════════════════════════════════════════════════════
   MY TICKETS — customer's own complaints + track search
════════════════════════════════════════════════════════════ */
let myDB = [];

function loadMyTickets() {
  const token = getToken();
  if (!token) return;

  fetch(`${API}/complaints/mine`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      myDB = data.data;
      renderMyTickets();
      /* Update my tickets badge */
      const openMine = myDB.filter(t => t.status !== 'Resolved').length;
      setText('nb-mytickets', myDB.length);
    })
    .catch(() => showToast('⚠️', 'Could not load your tickets.'));
}

function renderMyTickets() {
  const tb = document.getElementById('my-tkt-tbody');
  if (!tb) return;

  if (myDB.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:36px">
      You have no complaints yet. <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="nav('submit')">Submit one →</button>
    </td></tr>`;
    return;
  }

  tb.innerHTML = myDB.map(t => `
    <tr>
      <td><span class="ref-id" onclick="openMyTicket('${t.ref_number}')">${t.ref_number}</span></td>
      <td>${fmtDate(t.submitted_date)}</td>
      <td>${t.complaint_type}</td>
      <td><span class="pill pri-pill ${priorityCls(t.priority)}">${priorityIcon(t.priority)} ${t.priority}</span></td>
      <td><span class="pill ${pillCls(t.status)}">${t.status}</span></td>
      <td>${t.assigned_to || 'Unassigned'}</td>
    </tr>`).join('');
}

function openMyTicket(ref) {
  /* Reuse existing openTicket panel */
  openTicket(ref);
}

function myTrackLookup() {
  const q   = (document.getElementById('my-track-in').value || '').trim();
  const res = document.getElementById('my-track-results');
  if (!q) { res.innerHTML = ''; return; }

  fetch(`${API}/complaints/mine?search=${encodeURIComponent(q)}`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.data.length) {
        res.innerHTML = `<p style="color:var(--txt3);text-align:center;font-size:13px;padding:16px 0">
          No complaints found for "<strong style="color:var(--txt)">${q}</strong>"
        </p>`;
        return;
      }
      res.innerHTML = data.data.map(t => `
        <div class="tr-item" onclick="openTicket('${t.ref_number}')" style="cursor:pointer">
          <div>
            <div class="tr-ref">${t.ref_number}</div>
            <div class="tr-sub">${t.complaint_type} · ${fmtDate(t.submitted_date)} · Assigned: ${t.assigned_to || 'Unassigned'}</div>
          </div>
          <span class="pill ${pillCls(t.status)}">${t.status}</span>
        </div>`).join('');
    })
    .catch(() => {
      res.innerHTML = `<p style="color:var(--txt3);text-align:center;font-size:13px;padding:16px 0">Could not connect to server.</p>`;
    });
}



/* ════════════════════════════════════════════════════════════
   MARK RESOLVED
════════════════════════════════════════════════════════════ */
function loadResolveTickets() {
  const token = getToken();
  if (!token) return;

  fetch(`${API}/complaints?limit=200`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      DB = data.data;
      renderResolve();
      updateBadges();
    })
    .catch(() => {});
}

function renderResolve() {
  const tb = document.getElementById('res-tbody');
  if (!tb) return;

  const open = DB.filter(t => t.status !== 'Resolved');
  setText('rcount', `${open.length} open ticket${open.length !== 1 ? 's' : ''}`);

  tb.innerHTML = open.length === 0
    ? `<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:36px">🎉 All tickets are resolved!</td></tr>`
    : open.map(t => `
        <tr>
          <td><input type="checkbox" class="rchk" data-ref="${t.ref_number}"></td>
          <td><span class="ref-id" onclick="openTicket('${t.ref_number}')">${t.ref_number}</span></td>
          <td style="color:var(--txt);font-weight:500">${t.customer_name}</td>
          <td>${t.complaint_type}</td>
          <td><span class="pill ${pillCls(t.status)}">${t.status}</span></td>
          <td>
            <div class="asgn">
              <div class="asgn-av">${ini(t.assigned_to || 'UN')}</div>${t.assigned_to || 'Unassigned'}
            </div>
          </td>
        </tr>`).join('');
}

function markResolved() {
  const chks = document.querySelectorAll('.rchk:checked');
  if (!chks.length) { showToast('⚠️', 'Select at least one ticket to resolve'); return; }

  const refs = [...chks].map(c => c.dataset.ref);
  let done = 0;

  const resolveTicket = (ref) => {
    const ticket = DB.find(t => t.ref_number === ref);
    const currentStatus = ticket ? ticket.status : 'Pending';
    if (currentStatus === 'Resolved') return Promise.resolve({ ok: true });
    return fetch(`${API}/complaints/${ref}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status: 'Resolved' })
    }).then(r => r.json());
  };

  const next = (i) => {
    if (i >= refs.length) {
      showToast('✅', `${done} ticket${done !== 1 ? 's' : ''} marked as Resolved`);
      loadResolveTickets();
      return;
    }
    resolveTicket(refs[i])
    .then(data => { if (data && data.ok) done++; next(i + 1); })
    .catch(() => next(i + 1));
  };

  next(0);
}

function selectAll(v) {
  document.querySelectorAll('.rchk').forEach(c => c.checked = v);
}


/* ════════════════════════════════════════════════════════════
   REPORTS
════════════════════════════════════════════════════════════ */
function renderReports() {
  const token = getToken();
  if (!token) return;

  fetch(`${API}/reports/dashboard`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      const t  = data.data.totals;
      const ty = data.data.by_type    || [];
      const pr = data.data.by_priority || [];

      const total    = t.total    || 0;
      const resolved = t.resolved || 0;
      const inProg   = t.in_progress || 0;
      const pending  = t.pending  || 0;

      setText('rs-total', total);
      setText('rs-res',   resolved);
      setText('rs-prog',  inProg);
      setText('rs-pend',  pending);
      setText('rs-rate',  total ? Math.round(resolved / total * 100) + '%' : '—');

      /* Resolution rate table */
      const tb = document.getElementById('rpt-tbody');
      if (tb) {
        tb.innerHTML = ty.map(r => {
          const res  = r.resolved    || 0;
          const pend = r.pending     || 0;
          const rate = r.count ? Math.round(res / r.count * 100) : 0;
          return `<tr>
            <td style="color:var(--txt);font-weight:500">${r.complaint_type}</td>
            <td><strong style="color:var(--txt)">${r.count}</strong></td>
            <td><span style="color:var(--green);font-weight:600">${res}</span></td>
            <td><span style="color:var(--yellow);font-weight:600">${pend}</span></td>
            <td>
              <div class="progress-bar-wrap">
                <div class="progress-bar">
                  <div class="progress-bar-fill" style="width:${rate}%;background:var(--green)"></div>
                </div>
                <span style="font-size:11px;font-weight:700;color:var(--txt2);min-width:32px">${rate}%</span>
              </div>
            </td>
          </tr>`;
        }).join('');
      }

      /* Type breakdown mini-bars */
      const tbars = document.getElementById('type-bars');
      if (tbars) {
        tbars.innerHTML = ty.map(r => `
          <div style="display:flex;flex-direction:column;gap:3px">
            <div style="display:flex;justify-content:space-between;font-size:11px">
              <span style="color:var(--txt2)">${r.complaint_type}</span>
              <span style="color:var(--txt);font-weight:700">${r.count}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-bar-fill"
                style="width:${Math.round(r.count / Math.max(total,1) * 100)}%;background:var(--accent)">
              </div>
            </div>
          </div>`).join('');
      }
    })
    .catch(() => {});
}


/* ════════════════════════════════════════════════════════════
   RATINGS PAGE
════════════════════════════════════════════════════════════ */
function renderRatingsPage() {
  const token = getToken();
  if (!token) return;

  fetch(`${API}/reports/satisfaction`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      const rated = data.data; /* all ratings — no filtering */  /* all ratings — no filtering */

      const avgEl  = document.getElementById('avg-rating');
      const cntEl  = document.getElementById('rated-count');
      const barsEl = document.getElementById('rating-bars');
      const tbody  = document.getElementById('ratings-tbody');

      const avg = rated.length
        ? (rated.reduce((s, t) => s + (t.satisfaction_rating || 0), 0) / rated.length).toFixed(1)
        : '—';

      if (avgEl) avgEl.textContent = avg !== '—' ? `${avg} ⭐` : '—';
      if (cntEl) cntEl.textContent = `${rated.length} rating${rated.length !== 1 ? 's' : ''} received`;

      if (barsEl) {
        const dist = [5,4,3,2,1].map(s => ({
          s, count: rated.filter(t => t.satisfaction_rating === s).length
        }));
        barsEl.innerHTML = dist.map(d => {
          const pct = rated.length ? Math.round(d.count / rated.length * 100) : 0;
          return `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
            <span style="width:14px;color:var(--txt3);text-align:right">${d.s}★</span>
            <div class="progress-bar" style="flex:1">
              <div class="progress-bar-fill" style="width:${pct}%;background:#f59e0b"></div>
            </div>
            <span style="width:22px;color:var(--txt2);font-weight:600">${d.count}</span>
          </div>`;
        }).join('');
      }

      if (tbody) {
        tbody.innerHTML = rated.length === 0
          ? `<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:36px">No ratings yet.</td></tr>`
          : rated.map(t => `
            <tr>
              <td><span class="ref-id" onclick="openTicket('${t.ref_number}')">${t.ref_number}</span></td>
              <td style="color:var(--txt);font-weight:500">${t.customer_name}</td>
              <td>${t.complaint_type}</td>
              <td>${t.assigned_to || '—'}</td>
              <td><span style="font-size:16px">${'⭐'.repeat(t.satisfaction_rating)}</span>
                  <span style="font-size:11px;color:var(--txt3);margin-left:6px">${t.satisfaction_rating}/5</span>
              </td>
            </tr>`).join('');
      }
    })
    .catch(() => {});
}


/* ════════════════════════════════════════════════════════════
   SATISFACTION RATING
════════════════════════════════════════════════════════════ */
function submitRating(ref, stars) {
  const token = getToken();
  if (!token) { showToast('⚠️', 'Please log in to rate.'); return; }

  fetch(`${API}/complaints/${ref}/rate`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ rating: stars })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showToast('⚠️', data.message || 'Rating failed.'); return; }
    showToast('🌟', `Thank you! You rated this ${stars}/5 stars`);
    openTicket(ref);
  })
  .catch(() => showToast('⚠️', 'Could not submit rating.'));
}

function renderRatingUI(t) {
  const wrap = document.getElementById('pn-rating-wrap');
  if (!wrap) return;
  if (t.status !== 'Resolved') {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--txt3);font-style:italic">Rating available once ticket is resolved.</div>`;
    return;
  }
  if (t.satisfaction_rating) {
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:20px">${'⭐'.repeat(t.satisfaction_rating)}</span>
      <span style="font-size:12px;color:var(--txt3)">${t.satisfaction_rating}/5 — Thank you for your feedback!</span>
    </div>`;
    return;
  }
  wrap.innerHTML = `
    <div style="font-size:12px;color:var(--txt2);margin-bottom:8px">How satisfied are you with the resolution?</div>
    <div class="star-rating">
      ${[1,2,3,4,5].map(s => `
        <button class="star-btn" data-val="${s}" onclick="submitRating('${t.ref_number}',${s})" title="${s} star${s>1?'s':''}">
          ★
        </button>`).join('')}
    </div>`;
}


/* ════════════════════════════════════════════════════════════
   STAFF MANAGEMENT
════════════════════════════════════════════════════════════ */
let STAFF = [];

const STAFF_PHOTOS = {};

function loadStaff() {
  const token = getToken();
  if (!token) return;

  fetch(`${API}/staff`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      STAFF = data.data.map(s => ({
        id:     s.staff_id,
        name:   s.staff_name,
        dept:   s.dept_name,
        type:   s.handles_type,
        active: s.is_active
      }));
      renderStaffGrid();
      renderStaffTable();
    })
    .catch(() => showToast('⚠️', 'Could not load staff.'));
}

function staffAvatarHtml(s) {
  const photo = STAFF_PHOTOS[s.id];
  const inner = photo
    ? `<img src="${photo}" alt="${s.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<span>${ini(s.name)}</span>`;
  return `<div class="staff-av" onclick="triggerPhotoUpload(${s.id})" title="Click to upload photo">
    ${inner}
    <div class="staff-av-upload">📷</div>
  </div>`;
}

function triggerPhotoUpload(id) {
  let inp = document.getElementById('staff-photo-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'staff-photo-input';
    inp.style.display = 'none';
    inp.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const sid = parseInt(this.dataset.staffId);
      const reader = new FileReader();
      reader.onload = e => {
        STAFF_PHOTOS[sid] = e.target.result;
        renderStaffGrid();
        renderStaffTable();
        showToast('📸', 'Profile photo updated!');
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
    document.body.appendChild(inp);
  }
  inp.dataset.staffId = id;
  inp.click();
}

function renderStaffGrid() {
  const grid = document.getElementById('staff-grid');
  if (!grid) return;

  const depts = [...new Set(STAFF.map(s => s.dept))];

  grid.innerHTML = depts.map(dept => {
    const members = STAFF.filter(s => s.dept === dept);
    return `
      <div class="staff-dept-block">
        <div class="staff-dept-label">${dept}</div>
        <div class="staff-dept-members">
          ${members.map(s => {
            const open = DB.filter(t => t.assigned_to === s.name && t.status !== 'Resolved').length;
            const done = DB.filter(t => t.assigned_to === s.name && t.status === 'Resolved').length;
            return `
              <div class="staff-card ${!s.active ? 'staff-inactive' : ''}">
                ${staffAvatarHtml(s)}
                <div style="flex:1;min-width:0">
                  <div class="staff-name">${s.name}</div>
                  <div class="staff-role">${s.dept}</div>
                  <div class="staff-stats">
                    <div class="staff-stat"><div class="staff-stat-val" style="color:var(--yellow)">${open}</div><div class="staff-stat-k">Open</div></div>
                    <div class="staff-stat"><div class="staff-stat-val" style="color:var(--green)">${done}</div><div class="staff-stat-k">Done</div></div>
                  </div>
                </div>
                <div class="staff-actions">
                  <button class="btn btn-ghost btn-sm" onclick="openReassignModal(${s.id})">↔ Reassign</button>
                  <button class="btn-delete btn-sm" onclick="promptRemoveStaff(${s.id})">✕ Remove</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderStaffTable() {
  const tb = document.getElementById('staff-table');
  if (!tb) return;

  tb.innerHTML = STAFF.map(s => {
    const open  = DB.filter(t => t.assigned_to === s.name && t.status !== 'Resolved').length;
    const done  = DB.filter(t => t.assigned_to === s.name && t.status === 'Resolved').length;
    const total = open + done;
    const pct   = total ? Math.round(open / total * 100) : 0;
    return `
      <tr>
        <td>
          <div class="asgn">
            <div class="asgn-av">${STAFF_PHOTOS[s.id] ? `<img src="${STAFF_PHOTOS[s.id]}" alt="${s.name}">` : ini(s.name)}</div>
            <span style="color:var(--txt);font-weight:500">${s.name}</span>
          </div>
        </td>
        <td>${s.dept}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="progress-bar" style="width:80px">
              <div class="progress-bar-fill" style="width:${pct}%;background:${open>3?'var(--red)':open>1?'var(--yellow)':'var(--green)'}"></div>
            </div>
            <strong style="color:var(--txt)">${open}</strong>
          </div>
        </td>
        <td><span style="color:var(--green);font-weight:700">${done}</span></td>
        <td><span class="pill ${s.active ? 'pill-resolved' : 'pill-pending'}">${s.active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openReassignModal(${s.id})">↔ Reassign</button>
          <button class="btn-delete btn-sm" style="margin-left:4px" onclick="promptRemoveStaff(${s.id})">✕</button>
        </td>
      </tr>`;
  }).join('');
}

function openAddStaffModal() {
  document.getElementById('add-staff-name').value = '';
  const sel = document.getElementById('add-staff-dept');
  if (sel) {
    sel.innerHTML = ALL_DEPTS.map(d => `<option value="${d}">${d}</option>`).join('');
  }
  document.getElementById('add-staff-overlay').classList.add('open');
}

function closeAddStaffModal() {
  document.getElementById('add-staff-overlay').classList.remove('open');
}

function confirmAddStaff() {
  const name     = document.getElementById('add-staff-name').value.trim();
  const dept     = document.getElementById('add-staff-dept').value;
  const typeMap  = {};
  ALL_DEPTS.forEach((d,i) => typeMap[d] = ALL_TYPES[i]);
  const handles  = typeMap[dept] || ALL_TYPES[0];

  if (!name) { showToast('⚠️', 'Please enter a staff name'); return; }

  fetch(`${API}/staff`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ staff_name: name, dept_name: dept, handles_type: handles })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showToast('⚠️', data.message || 'Could not add staff.'); return; }
    closeAddStaffModal();
    loadStaff();
    showToast('✅', `${name} added to ${dept}`);
  })
  .catch(() => showToast('⚠️', 'Could not add staff.'));
}

let removeStaffId = null;
function promptRemoveStaff(id) {
  const s = STAFF.find(x => x.id === id);
  if (!s) return;
  removeStaffId = id;
  document.getElementById('remove-staff-name').textContent = s.name;
  const open = DB.filter(t => t.assigned_to === s.name && t.status !== 'Resolved').length;
  document.getElementById('remove-staff-warn').textContent =
    open > 0 ? `⚠️ This staff has ${open} open ticket(s).` : '';
  document.getElementById('remove-staff-overlay').classList.add('open');
}

function cancelRemoveStaff() {
  removeStaffId = null;
  document.getElementById('remove-staff-overlay').classList.remove('open');
}

function confirmRemoveStaff() {
  if (!removeStaffId) return;
  const s = STAFF.find(x => x.id === removeStaffId);
  if (!s) return;

  fetch(`${API}/staff/${removeStaffId}`, {
    method:  'DELETE',
    headers: authHeaders()
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showToast('⚠️', data.message || 'Could not remove staff.'); return; }
    cancelRemoveStaff();
    loadStaff();
    showToast('🗑️', `${s.name} removed from staff`);
  })
  .catch(() => showToast('⚠️', 'Could not remove staff.'));
}

let reassignStaffId = null;
function openReassignModal(id) {
  const s = STAFF.find(x => x.id === id);
  if (!s) return;
  reassignStaffId = id;
  document.getElementById('reassign-staff-name').textContent = s.name;

  const sel = document.getElementById('reassign-dept');
  sel.innerHTML = ALL_DEPTS.map(d =>
    `<option value="${d}" ${d === s.dept ? 'selected' : ''}>${d}</option>`
  ).join('');

  document.getElementById('reassign-overlay').classList.add('open');
}

function closeReassignModal() {
  reassignStaffId = null;
  document.getElementById('reassign-overlay').classList.remove('open');
}

function confirmReassign() {
  if (!reassignStaffId) return;
  const s    = STAFF.find(x => x.id === reassignStaffId);
  const dept = document.getElementById('reassign-dept').value;
  if (!s) { closeReassignModal(); return; }

  fetch(`${API}/staff/${reassignStaffId}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify({ dept_name: dept })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showToast('⚠️', data.message || 'Could not reassign.'); return; }
    closeReassignModal();
    loadStaff();
    showToast('↔️', `${s.name} moved to ${dept}`);
  })
  .catch(() => showToast('⚠️', 'Could not reassign staff.'));
}


/* ════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════ */
function pillCls(s) {
  if (s === 'Resolved')    return 'pill-resolved';
  if (s === 'In Progress') return 'pill-progress';
  return 'pill-pending';
}

function priorityCls(p) {
  if (p === 'Urgent') return 'pri-urgent';
  if (p === 'High')   return 'pri-high';
  if (p === 'Medium') return 'pri-medium';
  return 'pri-low';
}

function priorityIcon(p) {
  if (p === 'Urgent') return '🔴';
  if (p === 'High')   return '🟠';
  if (p === 'Medium') return '🟡';
  return '🟢';
}

function ini(name) {
  return (name || 'UN').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function nowStr() {
  return new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function setText(id, v) {
  const e = document.getElementById(id);
  if (e) e.textContent = v;
}

let toastTimer;
function showToast(ic, tx) {
  const t = document.getElementById('toast');
  if (!t) return;
  setText('t-ic', ic);
  setText('t-tx', tx);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}


document.addEventListener('DOMContentLoaded', () => {
  loadLookups();
  nav('dashboard');
});
