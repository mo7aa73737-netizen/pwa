// YSK Mobile PWA App (Vanilla JS)
// - Firebase v9+ CDN
// - UI Tailwind
// - html5-qrcode for camera scanning

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, onSnapshot, doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
      updateStatus(true, 'متصل ');
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

function renderProducts() {
  const wrap = $('#productsContainer');
  const empty = $('#emptyProducts'); // تصحيح اسم العنصر
  const countEl = $('#productsCount');
  const searchInput = $('#searchInput');
  const q = (searchInput ? searchInput.value || '' : '').trim().toLowerCase();

  const filtered = state.products.filter(p => {
    const name = (p.name || '').toLowerCase();
    const barcode = (p.barcode || '').toLowerCase();
    const supplier = (p.supplier || '').toLowerCase();
    return !q || name.includes(q) || barcode.includes(q) || supplier.includes(q);
  });

  if (countEl) countEl.textContent = `${filtered.length} منتج`;

  if (wrap) wrap.innerHTML = '';
  if (!filtered.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

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
    // Only show success toast if products were actually loaded
    if (list.length > 0) {
      toast('تم تحديث المنتجات', 'success');
    }
  } catch (e) {
    console.error(e);
    toast('فشل تحميل المنتجات', 'error');
  }
}

// Manual scanner UI
let html5QrcodeScannerInstance = null;
let isScanning = false;

function openScannerUI(onResult) {
  console.log('openScannerUI called');
  
  // Prevent multiple scanner instances
  if (isScanning) {
    console.log('Scanner already running');
    return;
  }
  
  const overlay = $('#scannerSection');
  if (!overlay) {
    console.error('Scanner overlay not found');
    return;
  }
  
  console.log('Opening scanner UI');
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

  // Clean up any existing instance
  if (html5QrcodeScannerInstance) {
    try {
      html5QrcodeScannerInstance.clear();
    } catch (e) {
      console.log('Error clearing previous scanner:', e);
    }
    html5QrcodeScannerInstance = null;
  }

  // Check if Html5Qrcode is available
  if (typeof Html5Qrcode === 'undefined') {
    console.error('Html5Qrcode library not loaded');
    toast('مكتبة المسح غير متاحة', 'error');
    return;
  }

  try {
    html5QrcodeScannerInstance = new Html5Qrcode(readerId);
    isScanning = true;
    
    html5QrcodeScannerInstance.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        try { 
          onResult(decodedText); 
        } finally { 
          closeScannerUI(); 
        }
      },
      () => {} // Error callback - ignore scan errors
    ).catch((err) => {
      console.error('scanner error', err);
      toast('تعذر فتح الكاميرا', 'error');
      isScanning = false;
      closeScannerUI();
    });
  } catch (err) {
    console.error('Failed to create scanner instance:', err);
    toast('فشل في إنشاء ماسح الباركود', 'error');
    isScanning = false;
  }
}

function closeScannerUI() {
  const overlay = $('#scannerSection');
  if (overlay) {
    overlay.classList.remove('scanner-enter');
    overlay.classList.add('scanner-leave');
    setTimeout(() => { 
      overlay.classList.add('hidden'); 
      overlay.classList.remove('scanner-leave'); 
    }, 150);
  }
  
  if (html5QrcodeScannerInstance && isScanning) {
    try {
      html5QrcodeScannerInstance.stop()
        .then(() => {
          if (html5QrcodeScannerInstance) {
            html5QrcodeScannerInstance.clear();
          }
        })
        .catch((err) => {
          console.log('Error stopping scanner:', err);
        })
        .finally(() => {
          html5QrcodeScannerInstance = null;
          isScanning = false;
        });
    } catch (err) {
      console.log('Error in closeScannerUI:', err);
      html5QrcodeScannerInstance = null;
      isScanning = false;
    }
  } else {
    isScanning = false;
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
    // Process all pending scan requests, including on initial load
    snap.docChanges().forEach(change => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        if (data && data.type === 'scanBarcode' && data.status === 'pending') {
          toast('تم استلام طلب مسح من النظام', 'info');
          
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
  if (!state.scannerDb) {
    console.log('Scanner DB not available for fixed listener');
    return;
  }
  
  console.log('Starting fixed scanner compatibility listener');
  const fixedRef = doc(state.scannerDb, 'scannerSessions', 'fixed');
  let processing = false;
  
  onSnapshot(fixedRef, (snap) => {
    const data = snap.data() || {};
    console.log('Fixed scanner listener received data:', data);
    
    // Check for scan requests immediately, including on initial load
    if (data.status === 'scanRequested' && !processing) {
      processing = true;
      console.log('Processing scan request from fixed listener');
      toast('تم استلام طلب مسح من النظام', 'info');
      
      openScannerUI(async (value) => {
        console.log('Scanned value:', value);
        try {
          await setDoc(fixedRef, { status: 'scanned', scannedValue: value, updatedAt: serverTimestamp() }, { merge: true });
          toast('تم المسح بنجاح', 'success');
        } catch (e) {
          console.error('fixed compat write error', e);
          toast('فشل إرسال نتيجة المسح', 'error');
        } finally {
          setTimeout(() => { 
            processing = false; 
            console.log('Processing flag reset');
          }, 500);
        }
      });
    } else if (data.status === 'scanRequested' && processing) {
      console.log('Scan request already being processed');
    } else {
      console.log('No scan request or different status:', data.status);
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
    startFixedScannerCompatListener();
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

// Check for existing pending scan requests on startup
async function checkPendingScanRequests() {
  const s = state.settings || {};
  if (!state.scannerDb) return;
  
  try {
    // Check fixed scanner session first
    const fixedRef = doc(state.scannerDb, 'scannerSessions', 'fixed');
    const fixedSnap = await getDoc(fixedRef);
    
    if (fixedSnap.exists()) {
      const data = fixedSnap.data();
      // Only process recent requests (within last 5 minutes) to avoid old stale requests
      const requestTime = data.requestedAt?.toDate?.() || new Date(data.requestedAt || 0);
      const now = new Date();
      const timeDiff = now - requestTime;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (data && data.status === 'scanRequested' && timeDiff < fiveMinutes) {
        toast('تم العثور على طلب مسح معلق', 'info');
        openScannerUI(async (value) => {
          try {
            await setDoc(fixedRef, { status: 'scanned', scannedValue: value, updatedAt: serverTimestamp() }, { merge: true });
            toast('تم المسح بنجاح', 'success');
          } catch (e) {
            console.error('fixed compat write error', e);
            toast('فشل إرسال نتيجة المسح', 'error');
          }
        });
        return; // Exit early if we found a valid fixed request
      } else if (data && data.status === 'scanRequested' && timeDiff >= fiveMinutes) {
        // Clear old stale requests
        await setDoc(fixedRef, { status: 'expired', updatedAt: serverTimestamp() }, { merge: true });
        console.log('Cleared stale scan request');
      }
    }
    
    // Check device-specific scanner sessions
    if (s.deviceId) {
      const sessionsCol = collection(state.scannerDb, 'scannerSessions');
      const qSessions = query(sessionsCol, where('deviceId', '==', s.deviceId), where('status', '==', 'pending'));
      const snap = await getDocs(qSessions);
      
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        
        // Only process recent requests
        const requestTime = data.createdAt?.toDate?.() || new Date(data.createdAt || 0);
        const now = new Date();
        const timeDiff = now - requestTime;
        const fiveMinutes = 5 * 60 * 1000;
        
        if (data && data.type === 'scanBarcode' && timeDiff < fiveMinutes) {
          toast('تم العثور على طلب مسح معلق', 'info');
          
          // mark scanning
          await setDoc(docSnap.ref, {
            status: 'scanning', updatedAt: serverTimestamp()
          }, { merge: true });

          openScannerUI(async (value) => {
            try {
              await setDoc(docSnap.ref, {
                status: 'done', barcode: value, updatedAt: serverTimestamp()
              }, { merge: true });
              toast('تم المسح بنجاح', 'success');
            } catch (e) {
              console.error(e);
              toast('فشل إرسال نتيجة المسح', 'error');
            }
          });
        } else if (data && timeDiff >= fiveMinutes) {
          // Clear old stale requests
          await setDoc(docSnap.ref, {
            status: 'expired', updatedAt: serverTimestamp()
          }, { merge: true });
          console.log('Cleared stale device scan request');
        }
      }
    }
  } catch (e) {
    console.error('Error checking pending scan requests:', e);
  }
}

async function boot() {
  state.settings = loadSettings();
  bindUI();
  await initFirebaseApps();
  startScannerSessionListener();
  startFixedScannerCompatListener();
  fetchProducts();
  
  // Check for pending scan requests after initialization
  setTimeout(() => checkPendingScanRequests(), 1000);
}

boot();