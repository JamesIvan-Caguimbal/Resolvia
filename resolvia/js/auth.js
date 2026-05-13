/* ============================================================
   Resolvia — Auth Module  v5
   Login · Register · Logout · Password Strength · Session
   Shared by index.html (user) and admin.html (admin)
   ============================================================ */
'use strict';

/* NOTE: API constant is defined in app.js which loads first */

/* ── Session ── */
let SESSION = null;

function getSession()  { return SESSION; }
function isLoggedIn()  { return SESSION !== null; }
function isAdmin()     { return SESSION?.mode === 'admin'; }

function saveSession(account, mode) {
  SESSION = { ...account, mode };
  try { sessionStorage.setItem('rv_session', JSON.stringify(SESSION)); } catch(e) {}
}
function loadSession() {
  try { const r = sessionStorage.getItem('rv_session'); if(r) SESSION = JSON.parse(r); } catch(e) { SESSION=null; }
  return SESSION;
}
function clearSession() {
  SESSION = null;
  try {
    sessionStorage.removeItem('rv_session');
    sessionStorage.removeItem('rv_token');
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════
   PASSWORD STRENGTH
══════════════════════════════════════════════════════ */
function checkPasswordStrength(pw) {
  if (!pw.length) return { level:0, label:'', cls:'' };
  if (pw.length < 8) return { level:1, label:'⚠ Weak — minimum 8 characters required', cls:'weak' };
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 2) return { level:2, label:'Fair — add numbers or symbols', cls:'fair' };
  if (s <= 3) return { level:3, label:'Good password',                 cls:'good' };
  return             { level:4, label:'Strong password ✓',             cls:'strong' };
}

function updateStrengthUI(pw, barId, labelId, hintId) {
  const r   = checkPasswordStrength(pw);
  const bar = document.getElementById(barId);
  if (!bar) return r;
  bar.querySelectorAll('.pw-seg').forEach((seg,i) => {
    seg.className = 'pw-seg';
    if (i < r.level) seg.classList.add(r.cls);
  });
  const lbl  = document.getElementById(labelId);
  const hint = document.getElementById(hintId);
  if (lbl)  { lbl.textContent = r.label; lbl.className = 'pw-label ' + r.cls; }
  if (hint) { hint.textContent = pw.length > 0 && pw.length < 8 ? `${8-pw.length} more char${8-pw.length!==1?'s':''} needed` : pw.length>=8 ? 'Minimum met ✓' : ''; }
  return r;
}

/* ══════════════════════════════════════════════════════
   EYE TOGGLE
══════════════════════════════════════════════════════ */
const EYE     = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function togglePwVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  const isText = input.type === 'text';
  input.type   = isText ? 'password' : 'text';
  if (btn) btn.innerHTML = isText ? EYE : EYE_OFF;
}

/* ══════════════════════════════════════════════════════
   ERROR / SUCCESS DISPLAY
══════════════════════════════════════════════════════ */
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-error show';
  setTimeout(() => el.style.animation = '', 10);
}
function showAuthSuccess(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-success show';
}
function hideAuthMsg(id) {
  const el = document.getElementById(id);
  if (el) el.className = el.className.replace(/\bauth-error\b|\bauth-success\b|\bshow\b/g,'').trim();
}

/* ══════════════════════════════════════════════════════
   AUTH TAB SWITCHING
══════════════════════════════════════════════════════ */
function switchAuthTab(tab, prefix) {
  const loginPanel = document.getElementById(`${prefix}-login-panel`);
  const regPanel   = document.getElementById(`${prefix}-register-panel`);
  const loginTab   = document.getElementById(`${prefix}-tab-login`);
  const regTab     = document.getElementById(`${prefix}-tab-register`);

  if (tab === 'login') {
    loginPanel?.classList.add('active');
    regPanel?.classList.remove('active');
    loginTab?.classList.add('active');
    regTab?.classList.remove('active');
  } else {
    regPanel?.classList.add('active');
    loginPanel?.classList.remove('active');
    regTab?.classList.add('active');
    loginTab?.classList.remove('active');
  }
}

/* ══════════════════════════════════════════════════════
   CUSTOMER PORTAL VIEW SWITCHING
══════════════════════════════════════════════════════ */
function showRegisterView() {
  const lp = document.getElementById('u-login-panel');
  const rp = document.getElementById('u-register-panel');
  if (lp) lp.style.display = 'none';
  if (rp) rp.style.display = 'block';
  ['ureg-error','ureg-success'].forEach(id => hideAuthMsg(id));
}
function showLoginView() {
  const lp = document.getElementById('u-login-panel');
  const rp = document.getElementById('u-register-panel');
  if (rp) rp.style.display = 'none';
  if (lp) lp.style.display = 'block';
  hideAuthMsg('ulogin-error');
}

/* ══════════════════════════════════════════════════════
   USER LOGIN  (index.html)
══════════════════════════════════════════════════════ */
function userLogin() {
  const username = (document.getElementById('ulogin-user')?.value || '').trim().toLowerCase();
  const password = (document.getElementById('ulogin-pw')?.value   || '');
  const errId    = 'ulogin-error';
  hideAuthMsg(errId);

  if (!username || !password) { showAuthError(errId, 'Please enter username and password.'); return; }
  if (password.length < 8)   { showAuthError(errId, '⚠ Password too weak — minimum 8 characters required.'); return; }

  fetch(`${API}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password, mode: 'customer' })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) {
      showAuthError(errId, 'Incorrect username or password.');
      document.getElementById('ulogin-pw').value = '';
      return;
    }
    const account = {
      username,
      name:  data.data.name,
      role:  data.data.role,
      token: data.data.token
    };
    sessionStorage.setItem('rv_token', data.data.token);
    saveSession(account, 'customer');
    hideAuthScreen();
    updateTopbarUser();
    if (typeof showToast === 'function') showToast('👋', `Welcome back, ${account.name}!`);
    if (typeof nav === 'function') nav('dashboard');
  })
  .catch(() => showAuthError(errId, 'Cannot connect to server. Make sure Flask is running.'));
}

/* ══════════════════════════════════════════════════════
   USER REGISTER  (index.html)
══════════════════════════════════════════════════════ */
function userRegister() {
  const fullname = (document.getElementById('ureg-name')?.value       || '').trim();
  const email    = (document.getElementById('ureg-email')?.value      || '').trim().toLowerCase();
  const username = (document.getElementById('ureg-user')?.value       || '').trim().toLowerCase();
  const password = (document.getElementById('ureg-pw')?.value         || '');
  const confirm  = (document.getElementById('ureg-pw-confirm')?.value || '');
  const errId    = 'ureg-error';
  const sucId    = 'ureg-success';
  hideAuthMsg(errId); hideAuthMsg(sucId);

  if (!fullname || !email || !username || !password || !confirm) {
    showAuthError(errId, 'All fields are required.'); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError(errId, 'Please enter a valid email address.'); return;
  }
  if (username.length < 3) {
    showAuthError(errId, 'Username must be at least 3 characters.'); return;
  }
  if (password.length < 8) {
    showAuthError(errId, '⚠ Password is too weak — minimum 8 characters required.'); return;
  }
  const strength = checkPasswordStrength(password);
  if (strength.level < 2) {
    showAuthError(errId, '⚠ Password is too weak — add uppercase letters, numbers, or symbols.'); return;
  }
  if (password !== confirm) {
    showAuthError(errId, 'Passwords do not match.'); return;
  }

  fetch(`${API}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password, full_name: fullname, email })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showAuthError(errId, data.message); return; }

    showAuthSuccess(sucId, '✅ Account created! Signing you in…');

    /* Auto-login after register */
    setTimeout(() => {
      fetch(`${API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password, mode: 'customer' })
      })
      .then(r => r.json())
      .then(loginData => {
        if (!loginData.ok) { showLoginView(); return; }
        const account = {
          username,
          name:  loginData.data.name,
          role:  loginData.data.role,
          token: loginData.data.token
        };
        sessionStorage.setItem('rv_token', loginData.data.token);
        saveSession(account, 'customer');
        hideAuthScreen();
        updateTopbarUser();
        if (typeof showToast === 'function') showToast('🎉', `Account created! Welcome, ${fullname}!`);
        if (typeof nav === 'function') nav('dashboard');
      })
      .catch(() => showLoginView());
    }, 1200);
  })
  .catch(() => showAuthError(errId, 'Cannot connect to server. Make sure Flask is running.'));
}

/* ══════════════════════════════════════════════════════
   ADMIN LOGIN  (admin.html)
══════════════════════════════════════════════════════ */
function adminLogin() {
  const username = (document.getElementById('login-user')?.value || '').trim().toLowerCase();
  const password = (document.getElementById('login-pw')?.value   || '');
  const errId    = 'login-error';
  hideAuthMsg(errId);

  if (!username || !password) { showAuthError(errId, 'Please enter username and password.'); return; }
  if (password.length < 8)   { showAuthError(errId, '⚠ Password too weak — minimum 8 characters required.'); return; }

  fetch(`${API}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password, mode: 'admin' })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) {
      showAuthError(errId, 'Incorrect admin credentials. Please try again.');
      document.getElementById('login-pw').value = '';
      return;
    }
    const account = {
      username,
      name:  data.data.name,
      role:  data.data.role,
      token: data.data.token
    };
    sessionStorage.setItem('rv_token', data.data.token);
    saveSession(account, 'admin');
    hideAuthScreen();
    updateTopbarUser();
    if (typeof showToast === 'function') showToast('👋', `Welcome back, ${account.name}!`);
    if (typeof nav === 'function') nav('dashboard');
  })
  .catch(() => showAuthError(errId, 'Cannot connect to server. Make sure Flask is running.'));
}

/* ══════════════════════════════════════════════════════
   ADMIN REGISTER  (admin.html — creates admin accounts)
══════════════════════════════════════════════════════ */
function adminRegister() {
  const fullname = (document.getElementById('areg-name')?.value       || '').trim();
  const email    = (document.getElementById('areg-email')?.value      || '').trim().toLowerCase();
  const username = (document.getElementById('areg-user')?.value       || '').trim().toLowerCase();
  const role     = (document.getElementById('areg-role')?.value       || 'Administrator');
  const password = (document.getElementById('areg-pw')?.value         || '');
  const confirm  = (document.getElementById('areg-pw-confirm')?.value || '');
  const errId    = 'areg-error';
  const sucId    = 'areg-success';
  hideAuthMsg(errId); hideAuthMsg(sucId);

  if (!fullname||!email||!username||!password||!confirm) { showAuthError(errId,'All fields are required.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))        { showAuthError(errId,'Please enter a valid email address.'); return; }
  if (username.length < 3)                               { showAuthError(errId,'Username must be at least 3 characters.'); return; }
  if (password.length < 8)                               { showAuthError(errId,'⚠ Password too weak — minimum 8 characters required.'); return; }
  const strength = checkPasswordStrength(password);
  if (strength.level < 2)                                { showAuthError(errId,'⚠ Password is too weak — improve it with uppercase, numbers, or symbols.'); return; }
  if (password !== confirm)                              { showAuthError(errId,'Passwords do not match.'); return; }

  const token = sessionStorage.getItem('rv_token');
  if (!token) { showAuthError(errId, 'You must be logged in as Administrator to create accounts.'); return; }

  fetch(`${API}/admin/accounts`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify({ username, password, full_name: fullname, email, role })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) { showAuthError(errId, data.message); return; }
    showAuthSuccess(sucId, `✅ Admin account created for ${fullname} (${role}). They can now sign in here.`);
    setTimeout(() => {
      ['areg-name','areg-email','areg-user','areg-pw','areg-pw-confirm'].forEach(id => {
        const e = document.getElementById(id); if(e) e.value = '';
      });
    }, 1500);
  })
  .catch(() => showAuthError(errId, 'Server error. Please try again.'));
}

/* ══════════════════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════════════════ */
function promptLogout()  { document.getElementById('logout-overlay')?.classList.add('open'); }
function cancelLogout()  { document.getElementById('logout-overlay')?.classList.remove('open'); }
function confirmLogout() { clearSession(); cancelLogout(); setTimeout(()=>window.location.reload(), 200); }

/* ══════════════════════════════════════════════════════
   AUTH SCREEN SHOW / HIDE
══════════════════════════════════════════════════════ */
function showAuthScreen() {
  const screen = document.getElementById('auth-screen');
  if (screen) { screen.classList.remove('hidden'); setTimeout(()=>{ const f=screen.querySelector('input'); if(f) f.focus(); },400); }
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'none';
}
function hideAuthScreen() {
  document.getElementById('auth-screen')?.classList.add('hidden');
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = '';
}

/* ══════════════════════════════════════════════════════
   TOPBAR USER UPDATE
══════════════════════════════════════════════════════ */
function updateTopbarUser() {
  const s = getSession();
  if (!s) return;
  const initials = (s.name || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const chip = document.getElementById('user-chip');
  if (chip) {
    const av = chip.querySelector('.user-chip-av');   if(av)  av.textContent  = initials;
    const nm = chip.querySelector('.user-chip-name'); if(nm)  nm.textContent  = s.name;
    const rl = chip.querySelector('.user-chip-role'); if(rl)  rl.textContent  = s.role;
  }
  ['sb-av','sb-name','sb-role'].forEach((id,i) => {
    const e = document.getElementById(id);
    if (e) e.textContent = [initials, s.name, s.role][i];
  });
  const av = document.querySelector('.avatar'); if(av) av.textContent = initials;
}

/* ══════════════════════════════════════════════════════
   ENTER KEY
══════════════════════════════════════════════════════ */
function authEnter(e, fn) { if (e.key === 'Enter') fn(); }

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
function initAuth(mode) {
  const s = loadSession();
  if (s && s.mode === mode) {
    hideAuthScreen();
    updateTopbarUser();
  } else if (s && s.mode !== mode) {
    clearSession();
    if (mode === 'admin') {
      window.location.href = '/';
    } else {
      window.location.href = '/admin';
    }
  } else {
    clearSession();
    showAuthScreen();
  }
}
