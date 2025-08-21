// YSK Mobile PWA App (Vanilla JS)
// - Firebase v9+ CDN
// - UI Tailwind
// - html5-qrcode for camera scanning

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const STORAGE_KEY = 'ysk_mobile_pwa_settings_v1';

const state = {
  syncApp: null,
  syncDb: null,
  scannerApp: null,
  scannerDb: null,
  settings: null,
  unsubscribeScan: null,
  products: [],
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveSettings(data) {
  state.settings = { ...state.settings, ...data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function toast(msg, type = 'info') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-white backdrop-blur-md bg-black/50 border border-white/20 whitespace-nowrap overflow-hidden text-ellipsis`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');
  icon.setAttribute('fill','currentColor');
  icon.setAttribute('class','w-5 h-5');
  icon.innerHTML = type === 'error'
    ? '<path fill-rule="evenodd" d="M12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5zM10.72 8.47a.75.75 0 011.06 0L12 8.69l.22-.22a.75.75 0 111.06 1.06L13.06 9.75l.22.22a.75.75 0 11-1.06 1.06L12 10.81l-.22.22a.75.75 0 01-1.06-1.06l.22-.22-.22-.22a.75.75 0 010-1.06zM9.75 15a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" clip-rule="evenodd"/>'
    : type === 'success'
    ? '<path fill-rule="evenodd" d="M10.28 15.22a.75.75 0 001.06 0l5.25-5.25a.75.75 0 00-1.06-1.06L10.81 13.44 8.47 11.1a.75.75 0 10-1.06 1.06l2.87 3.06z" clip-rule="evenodd"/>'
    : '<path fill-rule="evenodd" d="M12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5zM12 6a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V6.75A.75.75 0 0112 6zm0 9a.75.75 0 100 1.5A.75.75 0 0012 15z" clip-rule="evenodd"/>';
  const text = document.createElement('div');
  text.textContent = msg;
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>';
  closeBtn.className = 'p-1 rounded hover:bg-white/10';
  closeBtn.onclick = () => { el.classList.add('hide'); setTimeout(()=>el.remove(),160); };
  el.appendChild(icon); el.appendChild(text); el.appendChild(closeBtn);
  host.appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(()=>el.remove(),160); }, 3000);
}

function updateStatus(connected, label) {
  const el = $('#syncStatus');
  if (connected) {
    el.textContent = label || 'متصل';
    el.className = 'text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200';
  } else {
    el.textContent = label || 'غير متصل';
    el.className = 'text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200';
  }
}

async function initFirebaseApps() {
  const s = state.settings || {};

  // Init sync app (for reading products)
  if (s.syncApiKey && s.syncProjectId) {
    try {
      state.syncApp = initializeApp({
        apiKey: s.syncApiKey,
        authDomain: s.syncAuthDomain || undefined,
        projectId: s.syncProjectId,
      }, 'ysk-sync');
      state.syncDb = getFirestore(state.syncApp);
      updateStatus(true, 'متصل ✅');
    } catch (e) {
      console.error('sync init error', e);
      updateStatus(false, 'فشل المزامنة');
    }
  }

  // Use the same Firebase app for scanner sessions
  state.scannerApp = state.syncApp;
  state.scannerDb = state.syncDb;
}

async function testConnection() {
  try {
    await initFirebaseApps();
    // quick check - try to read products collection name
    const s = state.settings || {};
    if (state.syncDb && s.prefix) {
      const productsRef = collection(state.syncDb, `${s.prefix}_products`);
      await getDocs(query(productsRef, where('id', '!=', null)));
      toast('اتصال المزامنة ناجح ✅', 'success');
    } else {
      toast('من فضلك أدخل إعدادات المزامنة كاملة', 'error');
    }
    if (state.syncDb) {
      toast('اتصال الماسح جاهز ✅', 'success');
    }
  } catch (e) {
    console.error(e);
    toast('فشل اختبار الاتصال', 'error');
  }
}

function renderProducts() {
  const wrap = $('#productsContainer');
  const empty = $('#emptyState');
  const q = ($('#searchInput').value || '').trim().toLowerCase();

  const filtered = state.products.filter(p => {
    const name = (p.name || '').toLowerCase();
    const barcode = (p.barcode || '').toLowerCase();
    const supplier = (p.supplier || '').toLowerCase();
    return !q || name.includes(q) || barcode.includes(q) || supplier.includes(q);
  });

  wrap.innerHTML = '';
  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const p of filtered) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow p-3 flex items-center justify-between';

    const left = document.createElement('div');
    left.className = 'flex-1';
    left.innerHTML = `
      <div class="font-semibold text-gray-900">${p.name || '—'}</div>
      <div class="text-sm text-gray-500">باركود: ${p.barcode || '—'}</div>
    `;

    const price = document.createElement('div');
    price.className = 'text-blue-600 font-bold';
    price.textContent = (p.price || 0) + ' ج.م';

    card.appendChild(left);
    card.appendChild(price);
    wrap.appendChild(card);
  }
}

async function fetchProducts() {
  const s = state.settings || {};
  if (!state.syncDb || !s.prefix) return;
  try {
    const productsRef = collection(state.syncDb, `${s.prefix}_products`);
    const snap = await getDocs(productsRef);
    const list = [];
    snap.forEach(doc => list.push(doc.data()));
    state.products = list;
    renderProducts();
    toast('تم تحديث المنتجات', 'success');
  } catch (e) {
    console.error(e);
    toast('فشل تحميل المنتجات', 'error');
  }
}

// Manual scanner UI
let html5QrcodeScannerInstance = null;
function openScannerUI(onResult) {
  const overlay = $('#scannerSection');
  overlay.classList.remove('hidden');
  overlay.classList.remove('scanner-leave');
  overlay.classList.add('scanner-enter');
  const readerId = 'reader';
  const config = { fps: 10, qrbox: { width: 240, height: 160 }, rememberLastUsedCamera: true, aspectRatio: 1.7778 };

  if (html5QrcodeScannerInstance) {
    html5QrcodeScannerInstance.clear().catch(() => {});
    html5QrcodeScannerInstance = null;
  }

  // eslint-disable-next-line no-undef
  html5QrcodeScannerInstance = new Html5Qrcode(readerId);
  html5QrcodeScannerInstance.start(
    { facingMode: 'environment' },
    config,
    (decodedText) => {
      try { onResult(decodedText); } finally { closeScannerUI(); }
    },
    () => {}
  ).catch((err) => {
    console.error('scanner error', err);
    toast('تعذر فتح الكاميرا', 'error');
  });
}

function closeScannerUI() {
  const overlay = $('#scannerSection');
  overlay.classList.remove('scanner-enter');
  overlay.classList.add('scanner-leave');
  setTimeout(()=>{ overlay.classList.add('hidden'); overlay.classList.remove('scanner-leave'); }, 160);
  if (html5QrcodeScannerInstance) {
    html5QrcodeScannerInstance.stop().then(() => html5QrcodeScannerInstance.clear()).catch(() => {});
    html5QrcodeScannerInstance = null;
  }
}

// Scanner sessions listener
function startScannerSessionListener() {
  const s = state.settings || {};
  if (!state.scannerDb) return;
  if (!s.deviceId) {
    s.deviceId = `dev_${uid()}`;
    saveSettings({ deviceId: s.deviceId });
  }

  // Listen to pending sessions targeted for this device
  const sessionsCol = collection(state.scannerDb, 'scannerSessions');
  const qSessions = query(sessionsCol, where('deviceId', '==', s.deviceId), where('status', '==', 'pending'));

  if (state.unsubscribeScan) state.unsubscribeScan();
  state.unsubscribeScan = onSnapshot(qSessions, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        if (data && data.type === 'scanBarcode' && data.status === 'pending') {
          // mark scanning
          setDoc(doc(state.scannerDb, 'scannerSessions', change.doc.id), {
            status: 'scanning', updatedAt: serverTimestamp()
          }, { merge: true });

          openScannerUI(async (value) => {
            try {
              await setDoc(doc(state.scannerDb, 'scannerSessions', change.doc.id), {
                status: 'done', barcode: value, updatedAt: serverTimestamp()
              }, { merge: true });
              toast('تم المسح بنجاح', 'success');
            } catch (e) {
              console.error(e);
              toast('فشل إرسال نتيجة المسح', 'error');
            }
          });
        }
      }
    });
  }, (err) => {
    console.error('scanner listener error', err);
  });
}

// Compatibility listener for legacy fixed doc (scannerSessions/fixed)
function startFixedScannerCompatListener() {
  if (!state.scannerDb) return;
  const fixedRef = doc(state.scannerDb, 'scannerSessions', 'fixed');
  let processing = false;
  onSnapshot(fixedRef, (snap) => {
    const data = snap.data() || {};
    if (data.status === 'scanRequested' && !processing) {
      processing = true;
      openScannerUI(async (value) => {
        try {
          await setDoc(fixedRef, { status: 'scanned', scannedValue: value, updatedAt: serverTimestamp() }, { merge: true });
          toast('تم المسح (وضع التوافق)', 'success');
        } catch (e) {
          console.error('fixed compat write error', e);
          toast('فشل إرسال نتيجة المسح (توافق)', 'error');
        } finally {
          setTimeout(() => { processing = false; }, 500);
        }
      });
    }
  }, (err) => {
    console.error('fixed compat listener error', err);
  });
}

function bindUI() {
  // Settings modal
  const modal = $('#settingsModal');
  const openBtn = $('#openSettingsBtn');
  const closeBtn = $('#closeSettingsBtn');
  openBtn.onclick = () => { modal.classList.remove('hidden'); modal.classList.add('flex'); fillSettingsForm(); };
  closeBtn.onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
  modal.addEventListener('click', (e) => { if (e.target === modal) closeBtn.click(); });

  $('#saveSettingsBtn').onclick = async () => {
    const newS = {
      syncApiKey: $('#syncApiKey').value.trim(),
      syncAuthDomain: $('#syncAuthDomain').value.trim(),
      syncProjectId: $('#syncProjectId').value.trim(),
      prefix: $('#prefix').value.trim(),
      deviceId: ($('#deviceId').value || '').trim() || state.settings?.deviceId || `dev_${uid()}`,
    };
    saveSettings(newS);
    toast('تم حفظ الإعدادات', 'success');
    closeBtn.click();
    // re-init
    await initFirebaseApps();
    startScannerSessionListener();
    fetchProducts();
  };

  $('#testConnBtn').onclick = testConnection;

  // Search
  $('#searchInput').addEventListener('input', renderProducts);

  // Refresh
  $('#refreshBtn').onclick = fetchProducts;

  // Manual scanner
  $('#openScannerBtn').onclick = () => openScannerUI((value) => {
    $('#searchInput').value = value;
    renderProducts();
  });

  $('#closeScannerBtn').onclick = closeScannerUI;
}

function fillSettingsForm() {
  const s = state.settings || {};
  $('#syncApiKey').value = s.syncApiKey || '';
  $('#syncAuthDomain').value = s.syncAuthDomain || '';
  $('#syncProjectId').value = s.syncProjectId || '';
  $('#prefix').value = s.prefix || '';
        $('#deviceId').value = s.deviceId || '';
}

async function boot() {
  state.settings = loadSettings();
  bindUI();
  await initFirebaseApps();
  startScannerSessionListener();
  startFixedScannerCompatListener();
  fetchProducts();
}

boot();
