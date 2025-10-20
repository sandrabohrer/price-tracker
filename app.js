// ===== CONSTANTS =====
const STORAGE_KEYS = {
  IS_LOGGED_IN: 'isLoggedIn',
  PRICE_TRACKER_DATA: 'priceTrackerData',
  LAST_SYNC: 'lastSync',
};

const APP_PASSWORD_HASH = '1a2f18918af7c60fd88e15bc7b192589a4e1384a4f6f4a7e3843dc6979e345d1';

const ERROR_MESSAGES = {
  CAMERA_ACCESS: 'Unable to access camera. Please check your browser permissions.',
  INVALID_PRICE: 'Please enter a valid price greater than $0.00',
  MISSING_FIELDS: 'Please fill in all required fields',
  STORAGE_ERROR: 'Unable to save data. Please check your browser settings.',
  LOGIN_FAILED: 'Incorrect password. Please try again.',
};

// ===== STATE =====
const AppState = {
  isScanning: false,
  currentUser: null,
  db: null,
};

// ===== PRICE TRACKER DATABASE CLASS =====
class PriceTrackerDB {
  constructor() {
    this.storageKey = STORAGE_KEYS.PRICE_TRACKER_DATA;
    this.data = this.loadData();
  }

  loadData() {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      products: {},
      productVariants: {},
      prices: {},
      priceHistory: {},
    };
  }

  saveData() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      return true;
    } catch (e) {
      console.error('Error saving data:', e);
      return false;
    }
  }

  generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  parseSize(sizeString) {
    if (!sizeString || sizeString.trim() === '') return { value: null, unit: null };

    const match = sizeString.trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: match[2].toLowerCase(),
      };
    }
    return { value: null, unit: sizeString };
  }

  calculateUnitPrice(price, sizeValue) {
    if (!sizeValue || sizeValue === 0) return null;
    return parseFloat((price / sizeValue).toFixed(4));
  }

  addProduct(barcode, productName, brand = '') {
    const now = new Date().toISOString();

    if (!this.data.products[barcode]) {
      this.data.products[barcode] = {
        barcode,
        productName,
        brand,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      this.data.products[barcode].productName = productName;
      this.data.products[barcode].brand = brand;
      this.data.products[barcode].updatedAt = now;
    }

    this.saveData();
    return this.data.products[barcode];
  }

  addProductVariant(barcode, sizeString) {
    const variantKey = sizeString ? `${barcode}_${sizeString}` : barcode;
    const { value, unit } = this.parseSize(sizeString);

    if (!this.data.productVariants[variantKey]) {
      this.data.productVariants[variantKey] = {
        barcode,
        size: sizeString || '',
        sizeValue: value,
        sizeUnit: unit,
        createdAt: new Date().toISOString(),
      };
      this.saveData();
    }

    return this.data.productVariants[variantKey];
  }

  addPrice(barcode, productName, store, price, sizeString = '', notes = '') {
    const now = new Date().toISOString();
    const priceId = this.generateId();

    this.addProduct(barcode, productName);

    const variantKey = sizeString ? `${barcode}_${sizeString}` : barcode;
    if (sizeString) {
      this.addProductVariant(barcode, sizeString);
    }

    const variant = this.data.productVariants[variantKey];
    const unitPrice = variant ? this.calculateUnitPrice(price, variant.sizeValue) : null;

    const historyKey = `${variantKey}_${store}`;

    // Mark previous price as not current
    Object.values(this.data.prices).forEach((p) => {
      if (p.variant === variantKey && p.store === store && p.isCurrentPrice) {
        p.isCurrentPrice = false;
      }
    });

    const priceEntry = {
      id: priceId,
      barcode,
      variant: variantKey,
      store,
      price: parseFloat(price),
      date: now,
      unitPrice,
      notes,
      isCurrentPrice: true,
    };

    this.data.prices[priceId] = priceEntry;

    if (!this.data.priceHistory[historyKey]) {
      this.data.priceHistory[historyKey] = [];
    }

    this.data.priceHistory[historyKey].push({
      id: priceId,
      price: parseFloat(price),
      date: now,
      unitPrice,
    });

    this.saveData();
    return priceEntry;
  }

  updatePrice(priceId, newPrice, notes = '') {
    const priceEntry = this.data.prices[priceId];
    if (!priceEntry) {
      throw new Error('Price entry not found');
    }

    const now = new Date().toISOString();
    const variant = this.data.productVariants[priceEntry.variant];
    const unitPrice = variant ? this.calculateUnitPrice(newPrice, variant.sizeValue) : null;

    priceEntry.price = parseFloat(newPrice);
    priceEntry.date = now;
    priceEntry.unitPrice = unitPrice;
    priceEntry.notes = notes;

    const historyKey = `${priceEntry.variant}_${priceEntry.store}`;
    const historyEntry = this.data.priceHistory[historyKey]?.find((h) => h.id === priceId);
    if (historyEntry) {
      historyEntry.price = parseFloat(newPrice);
      historyEntry.date = now;
      historyEntry.unitPrice = unitPrice;
    }

    this.saveData();
    return priceEntry;
  }

  getAllCurrentPricesForBarcode(barcode) {
    return Object.values(this.data.prices)
      .filter((p) => p.barcode === barcode && p.isCurrentPrice)
      .sort((a, b) => a.price - b.price);
  }

  getPriceHistory(barcode, store, sizeString = '') {
    const variantKey = sizeString ? `${barcode}_${sizeString}` : barcode;
    const historyKey = `${variantKey}_${store}`;

    return this.data.priceHistory[historyKey] || [];
  }

  deletePrice(priceId) {
    const priceEntry = this.data.prices[priceId];
    if (!priceEntry) return false;

    delete this.data.prices[priceId];

    const historyKey = `${priceEntry.variant}_${priceEntry.store}`;
    if (this.data.priceHistory[historyKey]) {
      this.data.priceHistory[historyKey] = this.data.priceHistory[historyKey].filter(
        (h) => h.id !== priceId
      );

      if (this.data.priceHistory[historyKey].length === 0) {
        delete this.data.priceHistory[historyKey];
      }
    }

    this.saveData();
    return true;
  }

  exportForFirebase() {
    return {
      ...this.data,
      lastSync: new Date().toISOString(),
    };
  }
}

// ===== UTILITY FUNCTIONS =====

function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, isSuccess = false) {
  const toastId = isSuccess ? 'successToast' : 'errorToast';
  const toast = document.getElementById(toastId);
  toast.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function showError(message) {
  showToast(message, false);
}

function showSuccess(message) {
  showToast(message, true);
}

function getStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.error(`Error reading ${key} from storage:`, e);
    return null;
  }
}

function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`Error writing ${key} to storage:`, e);
    return false;
  }
}

// ===== PASSWORD FUNCTIONS =====

async function hashPassword(password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (e) {
    console.error('Error hashing password:', e);
    throw new Error('Password hashing failed');
  }
}

// ===== FORM VALIDATION =====

/**
 * Validate the add price form and enable/disable submit button
 */
function validateAddPriceForm() {
  const barcode = document.getElementById('barcode').value.trim();
  const productName = document.getElementById('productName').value.trim();
  const priceInput = document.getElementById('price');
  const price = priceInput.value;
  const sizeValue = document.getElementById('productSizeValue').value.trim();
  const sizeUnit = document.getElementById('productSizeUnit').value;
  const addButton = document.getElementById('addPriceBtn');
  const sizeError = document.getElementById('sizeError');
  const priceError = document.getElementById('priceError');

  // Clear any previous errors
  sizeError.style.display = 'none';
  sizeError.textContent = '';
  priceError.style.display = 'none';
  priceError.textContent = '';

  // Check required fields
  const hasBarcode = barcode.length >= 3;
  const hasProductName = productName.length >= 2;

  // Validate price
  const priceNum = parseFloat(price);
  let hasValidPrice = price !== '' && !isNaN(priceNum) && priceNum > 0;

  // Check if price has more than 2 decimal places
  if (hasValidPrice) {
    // Use regex to check decimal places in the actual input value
    const decimalMatch = price.match(/\.(\d+)$/);
    if (decimalMatch && decimalMatch[1].length > 2) {
      hasValidPrice = false;
      priceError.textContent = 'Price can only have up to 2 decimal places (e.g., 12.99)';
      priceError.style.display = 'block';
    }
  }

  // Check size fields consistency
  let sizeValid = true;
  if (sizeValue && !sizeUnit) {
    sizeValid = false;
    sizeError.textContent = 'Please select a unit for the size';
    sizeError.style.display = 'block';
  } else if (!sizeValue && sizeUnit) {
    sizeValid = false;
    sizeError.textContent = 'Please enter a size value';
    sizeError.style.display = 'block';
  }

  // Enable button only if all validations pass
  const isValid = hasBarcode && hasProductName && hasValidPrice && sizeValid;
  addButton.disabled = !isValid;

  return isValid;
}

// ===== VALIDATION FUNCTIONS =====

function validatePrice(price) {
  const parsed = parseFloat(price);
  if (isNaN(parsed) || parsed <= 0) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_PRICE };
  }
  return { valid: true, value: parsed };
}

function validateBarcode(barcode) {
  const trimmed = barcode.trim();
  if (!trimmed || trimmed.length < 3) {
    return { valid: false, error: 'Barcode must be at least 3 characters' };
  }
  return { valid: true, value: trimmed };
}

function validateProductName(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2) {
    return { valid: false, error: 'Product name must be at least 2 characters' };
  }
  return { valid: true, value: trimmed };
}

// ===== LOGIN/LOGOUT FUNCTIONS =====

async function handleLogin(event) {
  event.preventDefault();

  const passwordInput = document.getElementById('password');
  const password = passwordInput.value;

  try {
    const hashedPassword = await hashPassword(password);

    if (hashedPassword === APP_PASSWORD_HASH) {
      setStorageItem(STORAGE_KEYS.IS_LOGGED_IN, 'true');
      showApp();
      document.getElementById('loginError').classList.add('hidden');
    } else {
      document.getElementById('loginError').classList.remove('hidden');
    }
  } catch (e) {
    showError('Login failed. Please try again.');
    console.error('Login error:', e);
  }
}

function handleLogout(event) {
  event.preventDefault();
  localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN);
  location.reload();
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  updateSyncStatus();
  loadProductList();
}

// ===== TAB FUNCTIONS =====

function switchTab(tabName, button) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });

  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.remove('active');
  });

  button.classList.add('active');
  button.setAttribute('aria-selected', 'true');
  const tabContent = document.getElementById(tabName + 'Tab');
  tabContent.classList.add('active');

  if (tabName === 'view') {
    loadProductList();
  }
}

// ===== SCANNER FUNCTIONS =====

function startScanner() {
  const video = document.getElementById('video');
  const startBtn = document.getElementById('startScanBtn');
  const stopBtn = document.getElementById('stopScanBtn');

  video.classList.remove('hidden');
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  Quagga.init(
    {
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: video,
        constraints: {
          facingMode: 'environment',
        },
      },
      decoder: {
        readers: ['ean_reader', 'upc_reader', 'code_128_reader'],
      },
    },
    function (err) {
      if (err) {
        console.error('Scanner initialization error:', err);
        showError(ERROR_MESSAGES.CAMERA_ACCESS);
        stopScanner();
        return;
      }
      Quagga.start();
      AppState.isScanning = true;
    }
  );

  Quagga.onDetected(function (result) {
    if (AppState.isScanning) {
      const code = result.codeResult.code;
      stopScanner();
      showPriceComparison(code);
    }
  });
}

function stopScanner() {
  if (AppState.isScanning) {
    Quagga.stop();
  }
  AppState.isScanning = false;

  const video = document.getElementById('video');
  const startBtn = document.getElementById('startScanBtn');
  const stopBtn = document.getElementById('stopScanBtn');

  video.classList.add('hidden');
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
}

// ===== PRICE DISPLAY FUNCTIONS =====

function showPriceComparison(barcode) {
  const prices = AppState.db.getAllCurrentPricesForBarcode(barcode);
  const product = AppState.db.data.products[barcode];
  const resultDiv = document.getElementById('scanResult');

  if (prices.length === 0) {
    resultDiv.innerHTML = `
      <div class="comparison-result">
        <div class="barcode-display">${sanitizeHTML('Barcode: ' + barcode)}</div>
        <div class="no-data">No prices found for this product. Add one!</div>
        <button data-barcode="${sanitizeHTML(barcode)}" class="fill-form-btn">Add Price</button>
      </div>
    `;

    resultDiv.querySelector('.fill-form-btn').addEventListener('click', function () {
      fillAddForm(this.dataset.barcode);
    });
    return;
  }

  const bestPrice = Math.min(...prices.map((p) => p.price));
  const productName = sanitizeHTML(product?.productName || 'Unknown Product');

  let html = `
    <div class="comparison-result">
      <div class="barcode-display">${sanitizeHTML('Barcode: ' + barcode)}</div>
      <div class="product-name">${productName}</div>
  `;

  prices.forEach((p) => {
    const isBest = p.price === bestPrice;
    const variant = AppState.db.data.productVariants[p.variant];
    const sizeDisplay = variant?.size ? ` (${sanitizeHTML(variant.size)})` : '';
    const unitPriceDisplay = p.unitPrice ? ` • $${p.unitPrice.toFixed(2)}/unit` : '';
    const history = AppState.db.getPriceHistory(p.barcode, p.store, variant?.size || '');

    html += `
      <div class="price-item ${isBest ? 'best-price' : ''}">
        <div>
          <div class="store-name">${sanitizeHTML(p.store)}${sizeDisplay}</div>
          <div class="date">${sanitizeHTML(new Date(p.date).toLocaleDateString())}${unitPriceDisplay}</div>
          ${history.length > 1 ? `<div class="history-link" style="font-size: 12px; color: #667eea; cursor: pointer;" data-price-id="${p.id}">View history (${history.length} entries) →</div>` : ''}
        </div>
        <div>
          <div class="price">$${p.price.toFixed(2)}</div>
          <button class="edit-price-btn" data-price-id="${p.id}" style="font-size: 12px; padding: 4px 8px; margin-top: 5px; width: auto;">Edit</button>
        </div>
      </div>
    `;
  });

  html += `
    <button data-barcode="${sanitizeHTML(barcode)}" data-product="${sanitizeHTML(product?.productName || '')}" class="update-price-btn">Add Another Price</button>
  </div>
  `;

  resultDiv.innerHTML = html;

  resultDiv.querySelector('.update-price-btn').addEventListener('click', function () {
    fillAddForm(this.dataset.barcode, this.dataset.product);
  });

  resultDiv.querySelectorAll('.edit-price-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      showEditPriceDialog(this.dataset.priceId);
    });
  });

  resultDiv.querySelectorAll('.history-link').forEach((link) => {
    link.addEventListener('click', function (e) {
      e.stopPropagation();
      showPriceHistoryDialog(this.dataset.priceId);
    });
  });
}

function showEditPriceDialog(priceId) {
  const priceEntry = AppState.db.data.prices[priceId];
  if (!priceEntry) return;

  const newPrice = prompt(
    `Edit price for ${priceEntry.store}:\nCurrent: $${priceEntry.price.toFixed(2)}\n\nEnter new price:`
  );

  if (newPrice === null) return;

  const validation = validatePrice(newPrice);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  try {
    AppState.db.updatePrice(priceId, validation.value);
    showSuccess('Price updated successfully!');
    showPriceComparison(priceEntry.barcode);
  } catch (e) {
    showError('Failed to update price');
    console.error(e);
  }
}

function showPriceHistoryDialog(priceId) {
  const priceEntry = AppState.db.data.prices[priceId];
  if (!priceEntry) return;

  const variant = AppState.db.data.productVariants[priceEntry.variant];
  const history = AppState.db.getPriceHistory(
    priceEntry.barcode,
    priceEntry.store,
    variant?.size || ''
  );

  let message = `Price History for ${priceEntry.store}`;
  if (variant?.size) {
    message += ` (${variant.size})`;
  }
  message += ':\n\n';

  history
    .slice()
    .reverse()
    .forEach((h, index) => {
      const date = new Date(h.date).toLocaleDateString();
      const unitPrice = h.unitPrice ? ` ($${h.unitPrice.toFixed(2)}/unit)` : '';
      message += `${date}: $${h.price.toFixed(2)}${unitPrice}`;
      if (index === 0) message += ' ← Current';
      message += '\n';
    });

  alert(message);
}

function fillAddForm(barcode, productName = '') {
  const addTabBtn = document.getElementById('addTabBtn');
  switchTab('add', addTabBtn);

  document.getElementById('barcode').value = barcode;
  document.getElementById('productName').value = productName;
  document.getElementById('productSizeValue').value = '';
  document.getElementById('productSizeUnit').value = '';
  document.getElementById('price').focus();

  // Trigger validation to update button state
  validateAddPriceForm();
}

// ===== PRICE MANAGEMENT FUNCTIONS =====

function handleAddPrice(event) {
  event.preventDefault();

  const barcodeInput = document.getElementById('barcode').value;
  const productNameInput = document.getElementById('productName').value;
  const store = document.getElementById('store').value;
  const priceInput = document.getElementById('price').value;
  const sizeValue = document.getElementById('productSizeValue').value.trim();
  const sizeUnit = document.getElementById('productSizeUnit').value.trim();

  const barcodeValidation = validateBarcode(barcodeInput);
  if (!barcodeValidation.valid) {
    showError(barcodeValidation.error);
    return;
  }

  const nameValidation = validateProductName(productNameInput);
  if (!nameValidation.valid) {
    showError(nameValidation.error);
    return;
  }

  const priceValidation = validatePrice(priceInput);
  if (!priceValidation.valid) {
    showError(priceValidation.error);
    return;
  }

  // Build size string from value and unit
  let sizeString = '';
  if (sizeValue && sizeUnit) {
    sizeString = sizeValue + sizeUnit;
  } else if (sizeValue && !sizeUnit) {
    showError('Please select a unit for the size');
    return;
  } else if (!sizeValue && sizeUnit) {
    showError('Please enter a size value');
    return;
  }

  try {
    AppState.db.addPrice(
      barcodeValidation.value,
      nameValidation.value,
      store,
      priceValidation.value,
      sizeString
    );

    document.getElementById('addPriceForm').reset();
    showSuccess('Price added successfully!');
    updateSyncStatus();
  } catch (e) {
    showError('Failed to add price');
    console.error(e);
  }
}

function loadProductList() {
  const listDiv = document.getElementById('productList');
  const products = AppState.db.data.products;

  if (Object.keys(products).length === 0) {
    listDiv.innerHTML = '<div class="no-data">No prices recorded yet. Start by adding some!</div>';
    return;
  }

  let html = '';
  Object.keys(products).forEach((barcode) => {
    const product = products[barcode];
    const prices = AppState.db.getAllCurrentPricesForBarcode(barcode);

    if (prices.length === 0) return;

    const bestPrice = Math.min(...prices.map((p) => p.price));

    html += `<div class="comparison-result">`;
    html += `<div class="product-name">${sanitizeHTML(product.productName)}</div>`;
    html += `<div class="barcode-display">${sanitizeHTML('Barcode: ' + barcode)}</div>`;

    prices.forEach((p) => {
      const isBest = p.price === bestPrice;
      const variant = AppState.db.data.productVariants[p.variant];
      const sizeDisplay = variant?.size ? ` (${sanitizeHTML(variant.size)})` : '';
      const unitPriceDisplay = p.unitPrice ? ` • ${p.unitPrice.toFixed(2)}/unit` : '';
      const history = AppState.db.getPriceHistory(p.barcode, p.store, variant?.size || '');

      html += `
        <div class="price-item ${isBest ? 'best-price' : ''}">
          <div>
            <div class="store-name">${sanitizeHTML(p.store)}${sizeDisplay}</div>
            <div class="date">${sanitizeHTML(new Date(p.date).toLocaleDateString())}${unitPriceDisplay}</div>
            ${history.length > 1 ? `<div class="history-link" style="font-size: 12px; color: #667eea; cursor: pointer;" data-price-id="${p.id}">View history (${history.length} entries) →</div>` : ''}
          </div>
          <div>
            <div class="price">${p.price.toFixed(2)}</div>
            <button class="edit-price-btn" data-price-id="${p.id}" style="font-size: 12px; padding: 4px 8px; margin-top: 5px; width: auto;">Edit</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  listDiv.innerHTML = html;

  // Add event listeners for edit and history buttons
  listDiv.querySelectorAll('.edit-price-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      showEditPriceDialog(this.dataset.priceId);
    });
  });

  listDiv.querySelectorAll('.history-link').forEach((link) => {
    link.addEventListener('click', function (e) {
      e.stopPropagation();
      showPriceHistoryDialog(this.dataset.priceId);
    });
  });
}

// ===== SYNC FUNCTIONS =====

function handleSync() {
  updateSyncStatus();
  showSuccess('Sync functionality will be added with Firebase integration!');
}

function updateSyncStatus() {
  const lastSync = getStorageItem(STORAGE_KEYS.LAST_SYNC);
  const statusDiv = document.getElementById('syncStatus');

  if (lastSync) {
    try {
      const date = new Date(lastSync);
      statusDiv.textContent = `Last synced: ${date.toLocaleString()}`;
    } catch (e) {
      statusDiv.textContent = 'Last synced: Never (local only)';
    }
  } else {
    statusDiv.textContent = 'Last synced: Never (local only)';
  }

  setStorageItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
}

// ===== INITIALIZATION =====

function initializeEventListeners() {
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('password').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      handleLogin(e);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.getElementById('scanTabBtn').addEventListener('click', function () {
    switchTab('scan', this);
  });
  document.getElementById('addTabBtn').addEventListener('click', function () {
    switchTab('add', this);
  });
  document.getElementById('viewTabBtn').addEventListener('click', function () {
    switchTab('view', this);
  });

  document.getElementById('startScanBtn').addEventListener('click', startScanner);
  document.getElementById('stopScanBtn').addEventListener('click', stopScanner);

  document.getElementById('addPriceForm').addEventListener('submit', handleAddPrice);

  // Add real-time validation for the add price form
  const formInputs = ['barcode', 'productName', 'price', 'productSizeValue', 'productSizeUnit'];
  formInputs.forEach((inputId) => {
    const element = document.getElementById(inputId);
    element.addEventListener('input', validateAddPriceForm);
    element.addEventListener('change', validateAddPriceForm);
  });

  document.getElementById('syncBtn').addEventListener('click', handleSync);
}

function init() {
  AppState.db = new PriceTrackerDB();
  initializeEventListeners();

  if (getStorageItem(STORAGE_KEYS.IS_LOGGED_IN) === 'true') {
    showApp();
  }
}

if (typeof module === 'undefined' || !module.exports) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PriceTrackerDB,
    validatePrice,
    validateBarcode,
    validateProductName,
    sanitizeHTML,
    hashPassword,
    validateAddPriceForm,
  };
}
