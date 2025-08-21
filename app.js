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
  customers: [],
  invoices: [],
  expenses: [],
  currentTab: 'products'
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
  el.className = `toast flex items-center gap-3 px-3 py-2 rounded-lg shadow-lg text-white backdrop-blur-sm ${
    type === 'error' ? 'bg-red-500' : 
    type === 'success' ? 'bg-green-500' : 
    'bg-blue-500'
  } max-w-sm`;
  
  const iconEl = document.createElement('i');
  iconEl.className = `fas text-sm ${
    type === 'error' ? 'fa-exclamation-circle' : 
    type === 'success' ? 'fa-check-circle' : 
    'fa-info-circle'
  }`;
  
  const text = document.createElement('div');
  text.className = 'flex-1 text-sm font-medium truncate';
  text.textContent = msg;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<i class="fas fa-times text-xs"></i>';
  closeBtn.className = 'p-1 rounded hover:bg-white/20 transition-all';
  closeBtn.onclick = () => { el.classList.add('hide'); setTimeout(()=>el.remove(),150); };
  
  el.appendChild(iconEl); 
  el.appendChild(text); 
  el.appendChild(closeBtn);
  host.appendChild(el);
  
  setTimeout(() => { 
    el.classList.add('hide'); 
    setTimeout(()=>el.remove(),150); 
  }, 3500);
}

function updateStatus(connected, label) {
  const el = $('#syncStatus');
  if (connected) {
    el.innerHTML = `<i class="fas fa-check-circle text-green-500 me-1"></i>${label || 'متصل'}`;
    el.className = 'px-2 py-1 rounded-full bg-green-50 text-xs font-medium text-green-700';
  } else {
    el.innerHTML = `<i class="fas fa-times-circle text-red-500 me-1"></i>${label || 'غير متصل'}`;
    el.className = 'px-2 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600';
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
      toast('اتصال Firebase ناجح ✅', 'success');
    } else {
      toast('من فضلك أدخل إعدادات المزامنة كاملة', 'error');
    }
  } catch (e) {
    console.error(e);
    toast('فشل اختبار الاتصال', 'error');
  }
}

function switchTab(tabName) {
  // Update tab buttons
  $all('.tab-btn').forEach(btn => btn.classList.remove('active'));
  $(`#tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
  
  // Update content
  $all('.tab-content').forEach(content => content.classList.add('hidden'));
  $(`#content${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.remove('hidden');
  
  state.currentTab = tabName;
  renderCurrentTab();
}

function renderCurrentTab() {
  switch(state.currentTab) {
    case 'products': renderProducts(); break;
    case 'customers': renderCustomers(); break;
    case 'invoices': renderInvoices(); break;
    case 'expenses': renderExpenses(); break;
  }
}

function renderProducts() {
  const wrap = $('#productsContainer');
  const empty = $('#emptyProducts');
  const countEl = $('#productsCount');
  const q = ($('#searchInput').value || '').trim().toLowerCase();

  const filtered = state.products.filter(p => {
    const name = (p.name || '').toLowerCase();
    const barcode = (p.barcode || '').toLowerCase();
    const supplier = (p.supplier || '').toLowerCase();
    return !q || name.includes(q) || barcode.includes(q) || supplier.includes(q);
  });

  countEl.textContent = `${filtered.length} منتج`;

  wrap.innerHTML = '';
  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const p of filtered) {
    const card = document.createElement('div');
    card.className = 'product-card rounded-lg p-3 flex items-center justify-between';

    const left = document.createElement('div');
    left.className = 'flex-1';
    left.innerHTML = `
      <div class="font-semibold text-gray-900 mb-1">${p.name || '—'}</div>
      <div class="text-sm text-gray-500 flex items-center gap-2">
        <i class="fas fa-barcode"></i>
        ${p.barcode || '—'}
      </div>
      ${p.supplier ? `<div class="text-xs text-gray-400 mt-1">${p.supplier}</div>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'text-left';
    right.innerHTML = `
      <div class="text-lg font-bold text-blue-600">${(p.price || 0).toFixed(2)}</div>
      <div class="text-xs text-gray-500">ج.م</div>
    `;

    card.appendChild(left);
    card.appendChild(right);
    wrap.appendChild(card);
  }
}

function renderCustomers() {
  const wrap = $('#customersContainer');
  const empty = $('#emptyCustomers');
  const countEl = $('#customersCount');
  const q = ($('#searchInput').value || '').trim().toLowerCase();

  const filtered = state.customers.filter(c => {
    const name = (c.name || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    const address = (c.address || '').toLowerCase();
    return !q || name.includes(q) || phone.includes(q) || address.includes(q);
  });

  countEl.textContent = `${filtered.length} عميل`;

  wrap.innerHTML = '';
  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const c of filtered) {
    const card = document.createElement('div');
    card.className = 'product-card rounded-lg p-3 flex items-center justify-between';

    const left = document.createElement('div');
    left.className = 'flex-1';
    left.innerHTML = `
      <div class="font-semibold text-gray-900 mb-1">${c.name || '—'}</div>
      <div class="text-sm text-gray-500 flex items-center gap-2">
        <i class="fas fa-phone"></i>
        ${c.phone || '—'}
      </div>
      ${c.address ? `<div class="text-xs text-gray-400 mt-1">${c.address}</div>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'text-left';
    right.innerHTML = `
      <div class="text-lg font-bold text-green-600">${(c.balance || 0).toFixed(2)}</div>
      <div class="text-xs text-gray-500">رصيد</div>
    `;

    card.appendChild(left);
    card.appendChild(right);
    wrap.appendChild(card);
  }
}

function renderInvoices() {
  const wrap = $('#invoicesContainer');
  const empty = $('#emptyInvoices');
  const countEl = $('#invoicesCount');
  const q = ($('#searchInput').value || '').trim().toLowerCase();

  const filtered = state.invoices.filter(i => {
    const id = (i.id || '').toLowerCase();
    const customerName = (i.customerName || '').toLowerCase();
    return !q || id.includes(q) || customerName.includes(q);
  });

  countEl.textContent = `${filtered.length} فاتورة`;

  wrap.innerHTML = '';
  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const i of filtered) {
    const card = document.createElement('div');
    card.className = 'product-card rounded-lg p-3 flex items-center justify-between';

    const left = document.createElement('div');
    left.className = 'flex-1';
    left.innerHTML = `
      <div class="font-semibold text-gray-900 mb-1">فاتورة #${i.id || '—'}</div>
      <div class="text-sm text-gray-500 flex items-center gap-2">
        <i class="fas fa-user"></i>
        ${i.customerName || 'عميل نقدي'}
      </div>
      ${i.date ? `<div class="text-xs text-gray-400 mt-1">${new Date(i.date).toLocaleDateString('ar-EG')}</div>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'text-left';
    right.innerHTML = `
      <div class="text-lg font-bold text-purple-600">${(i.total || 0).toFixed(2)}</div>
      <div class="text-xs text-gray-500">ج.م</div>
    `;

    card.appendChild(left);
    card.appendChild(right);
    wrap.appendChild(card);
  }
}

function renderExpenses() {
  const wrap = $('#expensesContainer');
  const empty = $('#emptyExpenses');
  const countEl = $('#expensesCount');
  const q = ($('#searchInput').value || '').trim().toLowerCase();

  const filtered = state.expenses.filter(e => {
    const description = (e.description || '').toLowerCase();
    const category = (e.category || '').toLowerCase();
    return !q || description.includes(q) || category.includes(q);
  });

  countEl.textContent = `${filtered.length} مصروف`;

  wrap.innerHTML = '';
  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const e of filtered) {
    const card = document.createElement('div');
    card.className = 'product-card rounded-lg p-3 flex items-center justify-between';

    const left = document.createElement('div');
    left.className = 'flex-1';
    left.innerHTML = `
      <div class="font-semibold text-gray-900 mb-1">${e.description || '—'}</div>
      <div class="text-sm text-gray-500 flex items-center gap-2">
        <i class="fas fa-tag"></i>
        ${e.category || '—'}
      </div>
      ${e.date ? `<div class="text-xs text-gray-400 mt-1">${new Date(e.date).toLocaleDateString('ar-EG')}</div>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'text-left';
    right.innerHTML = `
      <div class="text-lg font-bold text-red-600">${(e.amount || 0).toFixed(2)}</div>
      <div class="text-xs text-gray-500">ج.م</div>
    `;

    card.appendChild(left);
    card.appendChild(right);
    wrap.appendChild(card);
  }
}

async function fetchAllData() {
  const s = state.settings || {};
  if (!state.syncDb || !s.prefix) return;
  
  try {
    // Fetch all collections in parallel
    const [productsSnap, customersSnap, invoicesSnap, expensesSnap] = await Promise.all([
      getDocs(collection(state.syncDb, `${s.prefix}_products`)),
      getDocs(collection(state.syncDb, `${s.prefix}_customers`)),
      getDocs(collection(state.syncDb, `${s.prefix}_invoices`)),
      getDocs(collection(state.syncDb, `${s.prefix}_expenses`))
    ]);

    // Update state
    state.products = [];
    productsSnap.forEach(doc => state.products.push(doc.data()));
    
    state.customers = [];
    customersSnap.forEach(doc => state.customers.push(doc.data()));
    
    state.invoices = [];
    invoicesSnap.forEach(doc => state.invoices.push(doc.data()));
    
    state.expenses = [];
    expensesSnap.forEach(doc => state.expenses.push(doc.data()));

    // Render current tab
    renderCurrentTab();
    
    const totalItems = state.products.length + state.customers.length + state.invoices.length + state.expenses.length;
    if (totalItems > 0) {
      toast(`تم تحديث ${totalItems} عنصر`, 'success');
    }
  } catch (e) {
    console.error(e);
    toast('فشل تحميل البيانات', 'error');
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
  
  // Fullscreen camera config
  const config = { 
    fps: 10, 
    qrbox: function(viewfinderWidth, viewfinderHeight) {
      // Square QR box in the center
      const minEdgePercentage = 0.7;
      const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
      const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
      return {
        width: qrboxSize,
        height: qrboxSize
      };
    },
    rememberLastUsedCamera: true
  };

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
  setTimeout(()=>{ overlay.classList.add('hidden'); overlay.classList.remove('scanner-leave'); }, 150);
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
  
  let isInitialLoad = true;
  state.unsubscribeScan = onSnapshot(qSessions, (snap) => {
    if (isInitialLoad) {
      isInitialLoad = false;
      return; // Skip initial load to prevent auto-opening camera
    }
    
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
  let isInitialLoad = true;
  
  onSnapshot(fixedRef, (snap) => {
    const data = snap.data() || {};
    
    if (isInitialLoad) {
      isInitialLoad = false;
      return; // Skip initial load to prevent auto-opening camera
    }
    
    if (data.status === 'scanRequested' && !processing) {
      processing = true;
      openScannerUI(async (value) => {
        try {
          await setDoc(fixedRef, { status: 'scanned', scannedValue: value, updatedAt: serverTimestamp() }, { merge: true });
          toast('تم المسح بنجاح', 'success');
        } catch (e) {
          console.error('fixed compat write error', e);
          toast('فشل إرسال نتيجة المسح', 'error');
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
  // Tab switching
  $('#tabProducts').onclick = () => switchTab('products');
  $('#tabCustomers').onclick = () => switchTab('customers');
  $('#tabInvoices').onclick = () => switchTab('invoices');
  $('#tabExpenses').onclick = () => switchTab('expenses');

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
    startFixedScannerCompatListener();
    fetchAllData();
  };

  $('#testConnBtn').onclick = testConnection;

  // Search
  $('#searchInput').addEventListener('input', renderCurrentTab);

  // Refresh
  $('#refreshBtn').onclick = fetchAllData;

  // Manual scanner
  $('#openScannerBtn').onclick = () => openScannerUI((value) => {
    $('#searchInput').value = value;
    renderCurrentTab();
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
  fetchAllData();
}

boot();