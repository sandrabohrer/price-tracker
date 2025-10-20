// ===== CONSTANTS =====
const STORAGE_KEYS = {
    IS_LOGGED_IN: 'isLoggedIn',
    PRICES: 'prices',
    LAST_SYNC: 'lastSync'
};

const APP_PASSWORD_HASH = '8e2a8c0e74e0f5c35b138f4e9d3c8a7f6b4d1e9c0a5f3b7e2d8c4a6f1b9e3d7c';

const ERROR_MESSAGES = {
    CAMERA_ACCESS: 'Unable to access camera. Please check your browser permissions.',
    INVALID_PRICE: 'Please enter a valid price greater than $0.00',
    MISSING_FIELDS: 'Please fill in all required fields',
    STORAGE_ERROR: 'Unable to save data. Please check your browser settings.',
    LOGIN_FAILED: 'Incorrect password. Please try again.'
};

// ===== STATE =====
const AppState = {
    isScanning: false,
    currentUser: null
};

// ===== UTILITY FUNCTIONS =====

/**
 * Sanitize HTML to prevent XSS attacks
 */
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Show toast notification
 */
function showToast(message, isSuccess = false) {
    const toastId = isSuccess ? 'successToast' : 'errorToast';
    const toast = document.getElementById(toastId);
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

/**
 * Show error message
 */
function showError(message) {
    showToast(message, false);
}

/**
 * Show success message
 */
function showSuccess(message) {
    showToast(message, true);
}

// ===== STORAGE FUNCTIONS =====

/**
 * Get prices from localStorage with error handling
 */
function getPrices() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.PRICES);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error loading prices:', e);
        showError('Unable to load saved prices');
        return [];
    }
}

/**
 * Save prices to localStorage with error handling
 */
function savePrices(prices) {
    try {
        localStorage.setItem(STORAGE_KEYS.PRICES, JSON.stringify(prices));
        return true;
    } catch (e) {
        console.error('Error saving prices:', e);
        showError(ERROR_MESSAGES.STORAGE_ERROR);
        return false;
    }
}

/**
 * Get item from localStorage safely
 */
function getStorageItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.error(`Error reading ${key} from storage:`, e);
        return null;
    }
}

/**
 * Set item in localStorage safely
 */
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

/**
 * Hash password using SHA-256
 */
async function hashPassword(password) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (e) {
        console.error('Error hashing password:', e);
        throw new Error('Password hashing failed');
    }
}

/**
 * Generate password hash (for admin use in console)
 */
async function generatePasswordHash(password) {
    const hash = await hashPassword(password);
    console.log('Password hash:', hash);
    return hash;
}

// ===== VALIDATION FUNCTIONS =====

/**
 * Validate price input
 */
function validatePrice(price) {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed <= 0) {
        return { valid: false, error: ERROR_MESSAGES.INVALID_PRICE };
    }
    return { valid: true, value: parsed };
}

/**
 * Validate barcode input
 */
function validateBarcode(barcode) {
    const trimmed = barcode.trim();
    if (!trimmed || trimmed.length < 3) {
        return { valid: false, error: 'Barcode must be at least 3 characters' };
    }
    return { valid: true, value: trimmed };
}

/**
 * Validate product name
 */
function validateProductName(name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
        return { valid: false, error: 'Product name must be at least 2 characters' };
    }
    return { valid: true, value: trimmed };
}

// ===== LOGIN/LOGOUT FUNCTIONS =====

/**
 * Handle login
 */
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

/**
 * Handle logout
 */
function handleLogout(event) {
    event.preventDefault();
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN);
    location.reload();
}

/**
 * Show app screen
 */
function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    updateSyncStatus();
    loadProductList();
}

// ===== TAB FUNCTIONS =====

/**
 * Switch between tabs
 */
function switchTab(tabName, button) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Activate selected tab
    button.classList.add('active');
    button.setAttribute('aria-selected', 'true');
    const tabContent = document.getElementById(tabName + 'Tab');
    tabContent.classList.add('active');

    if (tabName === 'view') {
        loadProductList();
    }
}

// ===== SCANNER FUNCTIONS =====

/**
 * Start barcode scanner
 */
function startScanner() {
    const video = document.getElementById('video');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    
    video.classList.remove('hidden');
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: video,
            constraints: {
                facingMode: "environment"
            }
        },
        decoder: {
            readers: ["ean_reader", "upc_reader", "code_128_reader"]
        }
    }, function(err) {
        if (err) {
            console.error('Scanner initialization error:', err);
            showError(ERROR_MESSAGES.CAMERA_ACCESS);
            stopScanner();
            return;
        }
        Quagga.start();
        AppState.isScanning = true;
    });

    Quagga.onDetected(function(result) {
        if (AppState.isScanning) {
            const code = result.codeResult.code;
            stopScanner();
            showPriceComparison(code);
        }
    });
}

/**
 * Stop barcode scanner
 */
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

/**
 * Get prices for a specific barcode
 */
function getPricesForBarcode(barcode) {
    const allPrices = getPrices();
    return allPrices
        .filter(p => p.barcode === barcode)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Show price comparison for scanned barcode
 */
function showPriceComparison(barcode) {
    const prices = getPricesForBarcode(barcode);
    const resultDiv = document.getElementById('scanResult');

    if (prices.length === 0) {
        resultDiv.innerHTML = `
            <div class="comparison-result">
                <div class="barcode-display">${sanitizeHTML('Barcode: ' + barcode)}</div>
                <div class="no-data">No prices found for this product. Add one!</div>
                <button data-barcode="${sanitizeHTML(barcode)}" class="fill-form-btn">Add Price</button>
            </div>
        `;
        
        // Add event listener to the dynamically created button
        resultDiv.querySelector('.fill-form-btn').addEventListener('click', function() {
            fillAddForm(this.dataset.barcode);
        });
        return;
    }

    // Find best price
    const bestPrice = Math.min(...prices.map(p => p.price));
    const sanitizedProductName = sanitizeHTML(prices[0].productName);

    let html = `
        <div class="comparison-result">
            <div class="barcode-display">${sanitizeHTML('Barcode: ' + barcode)}</div>
            <div class="product-name">${sanitizedProductName}</div>
    `;

    prices.forEach(p => {
        const isBest = p.price === bestPrice;
        html += `
            <div class="price-item ${isBest ? 'best-price' : ''}">
                <div>
                    <div class="store-name">${sanitizeHTML(p.store)}</div>
                    <div class="date">${sanitizeHTML(new Date(p.date).toLocaleDateString())}</div>
                </div>
                <div class="price">$${p.price.toFixed(2)}</div>
            </div>
        `;
    });

    html += `
            <button data-barcode="${sanitizeHTML(barcode)}" data-product="${sanitizeHTML(prices[0].productName)}" class="update-price-btn">Update Price</button>
        </div>
    `;

    resultDiv.innerHTML = html;
    
    // Add event listener to the dynamically created button
    resultDiv.querySelector('.update-price-btn').addEventListener('click', function() {
        fillAddForm(this.dataset.barcode, this.dataset.product);
    });
}

/**
 * Fill the add form with barcode and product name
 */
function fillAddForm(barcode, productName = '') {
    // Switch to add tab
    const addTabBtn = document.getElementById('addTabBtn');
    switchTab('add', addTabBtn);
    
    // Fill form fields
    document.getElementById('barcode').value = barcode;
    document.getElementById('productName').value = productName;
    document.getElementById('price').focus();
}

// ===== PRICE MANAGEMENT FUNCTIONS =====

/**
 * Handle adding a new price
 */
function handleAddPrice(event) {
    event.preventDefault();
    
    const barcodeInput = document.getElementById('barcode').value;
    const productNameInput = document.getElementById('productName').value;
    const store = document.getElementById('store').value;
    const priceInput = document.getElementById('price').value;

    // Validate inputs
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

    const priceData = {
        barcode: barcodeValidation.value,
        productName: nameValidation.value,
        store: store,
        price: priceValidation.value,
        date: new Date().toISOString()
    };

    // Save to localStorage
    const allPrices = getPrices();
    allPrices.push(priceData);
    
    if (savePrices(allPrices)) {
        // Clear form
        document.getElementById('addPriceForm').reset();
        showSuccess('Price added successfully!');
        updateSyncStatus();
    }
}

/**
 * Load and display product list
 */
function loadProductList() {
    const allPrices = getPrices();
    const listDiv = document.getElementById('productList');

    if (allPrices.length === 0) {
        listDiv.innerHTML = '<div class="no-data">No prices recorded yet. Start by adding some!</div>';
        return;
    }

    // Group by product
    const products = {};
    allPrices.forEach(p => {
        if (!products[p.barcode]) {
            products[p.barcode] = {
                name: p.productName,
                prices: []
            };
        }
        products[p.barcode].prices.push(p);
    });

    let html = '';
    Object.keys(products).forEach(barcode => {
        const product = products[barcode];
        const bestPrice = Math.min(...product.prices.map(p => p.price));
        
        html += `<div class="comparison-result">`;
        html += `<div class="product-name">${sanitizeHTML(product.name)}</div>`;
        html += `<div class="barcode-display">${sanitizeHTML('Barcode: ' + barcode)}</div>`;
        
        product.prices.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
            const isBest = p.price === bestPrice;
            html += `
                <div class="price-item ${isBest ? 'best-price' : ''}">
                    <div>
                        <div class="store-name">${sanitizeHTML(p.store)}</div>
                        <div class="date">${sanitizeHTML(new Date(p.date).toLocaleDateString())}</div>
                    </div>
                    <div class="price">$${p.price.toFixed(2)}</div>
                </div>
            `;
        });
        
        html += `</div>`;
    });

    listDiv.innerHTML = html;
}

// ===== SYNC FUNCTIONS =====

/**
 * Sync data (placeholder for Firebase)
 */
function handleSync() {
    updateSyncStatus();
    showSuccess('Sync functionality will be added with Firebase integration!');
}

/**
 * Update sync status display
 */
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

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    // Login
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin(e);
        }
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Tabs
    document.getElementById('scanTabBtn').addEventListener('click', function() {
        switchTab('scan', this);
    });
    document.getElementById('addTabBtn').addEventListener('click', function() {
        switchTab('add', this);
    });
    document.getElementById('viewTabBtn').addEventListener('click', function() {
        switchTab('view', this);
    });
    
    // Scanner
    document.getElementById('startScanBtn').addEventListener('click', startScanner);
    document.getElementById('stopScanBtn').addEventListener('click', stopScanner);
    
    // Add price form
    document.getElementById('addPriceForm').addEventListener('submit', handleAddPrice);
    
    // Sync
    document.getElementById('syncBtn').addEventListener('click', handleSync);
}

/**
 * Initialize the app
 */
function init() {
    // Set up event listeners
    initializeEventListeners();
    
    // Check if already logged in
    if (getStorageItem(STORAGE_KEYS.IS_LOGGED_IN) === 'true') {
        showApp();
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
