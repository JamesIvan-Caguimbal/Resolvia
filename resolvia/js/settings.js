/* ============================================================
   Resolvia — Settings Module
   js/settings.js
   Dark mode toggle, preferences, settings panel
   ============================================================ */

'use strict';

let settingsPanelOpen = false;

/* ── Load saved preferences ── */
function loadPreferences() {
  const dark = localStorage.getItem('resolvia-dark') === 'true';
  if (dark) enableDarkMode(false); // false = no toast on load

  const compact = localStorage.getItem('resolvia-compact') === 'true';
  if (compact) document.documentElement.setAttribute('data-compact', 'true');

  // Sync toggles
  syncToggles();
}

/* ── Dark mode ── */
function enableDarkMode(toast = true) {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('resolvia-dark', 'true');
  syncToggles();
  if (toast && typeof showToast === 'function') showToast('🌙', 'Dark mode enabled');
}

function disableDarkMode(toast = true) {
  document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('resolvia-dark', 'false');
  syncToggles();
  if (toast && typeof showToast === 'function') showToast('☀️', 'Light mode enabled');
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  isDark ? disableDarkMode() : enableDarkMode();
}

function isDarkMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/* ── Sync all toggles to current state ── */
function syncToggles() {
  const dark    = isDarkMode();
  const compact = document.documentElement.getAttribute('data-compact') === 'true';
  const notifs  = localStorage.getItem('resolvia-notifs') !== 'false';

  setToggle('toggle-dark',    dark);
  setToggle('toggle-compact', compact);
  setToggle('toggle-notifs',  notifs);
}

function setToggle(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = checked;
}

/* ── Settings panel ── */
function toggleSettingsPanel() {
  settingsPanelOpen = !settingsPanelOpen;
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  if (settingsPanelOpen) {
    panel.classList.add('open');
    closeNotifPanel();
    syncToggles();
  } else {
    panel.classList.remove('open');
  }
}

function closeSettingsPanel() {
  settingsPanelOpen = false;
  document.getElementById('settings-panel')?.classList.remove('open');
}

/* ── Compact mode ── */
function toggleCompactMode(checked) {
  if (checked) {
    document.documentElement.setAttribute('data-compact', 'true');
    localStorage.setItem('resolvia-compact', 'true');
    if (typeof showToast === 'function') showToast('📐', 'Compact mode enabled');
  } else {
    document.documentElement.removeAttribute('data-compact');
    localStorage.setItem('resolvia-compact', 'false');
    if (typeof showToast === 'function') showToast('📐', 'Compact mode disabled');
  }
}

/* ── Notification sound preference ── */
function toggleNotifPref(checked) {
  localStorage.setItem('resolvia-notifs', checked ? 'true' : 'false');
  if (typeof showToast === 'function')
    showToast(checked ? '🔔' : '🔕', `Notifications ${checked ? 'enabled' : 'muted'}`);
}

/* ── Reset to defaults ── */
function resetSettings() {
  localStorage.removeItem('resolvia-dark');
  localStorage.removeItem('resolvia-compact');
  localStorage.removeItem('resolvia-notifs');
  disableDarkMode(false);
  document.documentElement.removeAttribute('data-compact');
  syncToggles();
  if (typeof showToast === 'function') showToast('🔄', 'Settings reset to defaults');
}

/* ── Close panels on outside click ── */
document.addEventListener('click', e => {
  const notifPanel    = document.getElementById('notif-panel');
  const settingsPanel = document.getElementById('settings-panel');
  const notifBtn      = document.getElementById('btn-notif');
  const settingsBtn   = document.getElementById('btn-settings');

  if (notifPanelOpen && notifPanel && !notifPanel.contains(e.target) && !notifBtn?.contains(e.target)) {
    closeNotifPanel();
  }
  if (settingsPanelOpen && settingsPanel && !settingsPanel.contains(e.target) && !settingsBtn?.contains(e.target)) {
    closeSettingsPanel();
  }
});

/* ── Init ── */
function initSettings() {
  loadPreferences();
}
