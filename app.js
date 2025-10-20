// Configuration
// Password hash for: AldiWegmansBJs2025!
// To generate a new hash, use the generatePasswordHash() function in browser console
const APP_PASSWORD_HASH = '8e2a8c0e74e0f5c35b138f4e9d3c8a7f6b4d1e9c0a5f3b7e2d8c4a6f1b9e3d7c';
let isScanning = false;

// Password hashing function (SHA-256)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Function to generate password hash (for admin use in console)
async function generatePasswordHash(password) {
    const hash = await hashPassword(password);
    console.log('Password hash:', hash);
    return hash;
}

// Check if already logged in
if (localStorage.getItem('isLoggedIn') === 'true') {
    showApp();
}

// Login function
async function login() {
    const password = document.getElementById('password').value;
    const hashedPassword = await hashPassword(password);
    
    if (hashedPassword === APP_PASSWORD_HASH) {
        localStorage.setItem('isLoggedIn', 'true');
        showApp();
        document.getElementById('loginError').classList.add('hidden');
    } else {
        document.getElementById('loginError').classList.remove('hidden');
    }
}

// Logout function
function logout() {
    localStorage.removeItem('isLoggedIn');
    location.reload();
}

// Show app screen
function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    updateSyncStatus();
    loadProductList();
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');

    if (tabName === 'view') {
        loadProductList();
    }
}

// Start barcode scanner
function startScanner() {
    const video = document.getElementById('video');
    video.classList.remove('hidden');
    document.getElementById('startScanBtn').classList.add('hidden');
    document.getElementById('stopScanBtn').classList.remove('hidden');

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
            console.error(err);
            alert('Camera access denied or not available');
            return;
        }
        Quagga.start();
        isScanning = true;
    });

    Quagga.onDetected(function(result) {
        if (isScanning) {
            const code = result.codeResult.code;
            stopScanner();
            showPriceComparison(code);
        }
    });
}

// Stop barcode scanner
function stopScanner() {
    Quagga.stop();
    isScanning = false;
    document.getElementById('video').classList.add('hidden');
    document.getElementById('startScanBtn').classList.remove('hidden');
    document.getElementById('stopScanBtn').classList.add('hidden');
}

// Show price comparison
function showPriceComparison(barcode) {
    const prices = getPricesForBarcode(barcode);
    const resultDiv = document.getElementById('scanResult');

    if (prices.length === 0) {
        resultDiv.innerHTML = `
            <div class="comparison-result">
                <div class="barcode-display">Barcode: ${barcode}</div>
                <div class="no-data">No prices found for this product. Add one!</div>
                <button onclick="fillAddForm('${barcode}')">Add Price</button>
            </div>
        `;
        return;
    }

    // Find best price
    const bestPrice = Math.min(...prices.map(p => p.price));

    let html = `
        <div class="comparison-result">
            <div class="barcode-display">Barcode: ${barcode}</div>
            <div class="product-name">${prices[0].productName}</div>
    `;

    prices.forEach(p => {
        const isBest = p.price === bestPrice;
        html += `
            <div class="price-item ${isBest ? 'best-price' : ''}">
                <div>
                    <div class="store-name">${p.store}</div>
                    <div class="date">${new Date(p.date).toLocaleDateString()}</div>
                </div>
                <div class="price">$${p.price.toFixed(2)}</div>
            </div>
        `;
    });

    html += `
            <button onclick="fillAddForm('${barcode}', '${prices[0].productName}')">Update Price</button>
        </div>
    `;

    resultDiv.innerHTML = html;
}

// Fill add form
function fillAddForm(barcode, productName = '') {
    switchTab('add');
    document.querySelector('.tab:nth-child(2)').click();
    document.getElementById('barcode').value = barcode;
    document.getElementById('productName').value = productName;
}

// Add price
function addPrice() {
    const barcode = document.getElementById('barcode').value.trim();
    const productName = document.getElementById('productName').value.trim();
    const store = document.getElementById('store').value;
    const price = parseFloat(document.getElementById('price').value);

    if (!barcode || !productName || !price) {
        alert('Please fill in all fields');
        return;
    }

    const priceData = {
        barcode,
        productName,
        store,
        price,
        date: new Date().toISOString()
    };

    // Save to localStorage
    let allPrices = JSON.parse(localStorage.getItem('prices') || '[]');
    allPrices.push(priceData);
    localStorage.setItem('prices', JSON.stringify(allPrices));

    // Clear form
    document.getElementById('barcode').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('price').value = '';

    alert('Price added successfully!');
    updateSyncStatus();
}

// Get prices for barcode
function getPricesForBarcode(barcode) {
    const allPrices = JSON.parse(localStorage.getItem('prices') || '[]');
    return allPrices.filter(p => p.barcode === barcode)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Load product list
function loadProductList() {
    const allPrices = JSON.parse(localStorage.getItem('prices') || '[]');
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
        html += `<div class="product-name">${product.name}</div>`;
        html += `<div class="barcode-display">Barcode: ${barcode}</div>`;
        
        product.prices.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
            const isBest = p.price === bestPrice;
            html += `
                <div class="price-item ${isBest ? 'best-price' : ''}">
                    <div>
                        <div class="store-name">${p.store}</div>
                        <div class="date">${new Date(p.date).toLocaleDateString()}</div>
                    </div>
                    <div class="price">$${p.price.toFixed(2)}</div>
                </div>
            `;
        });
        
        html += `</div>`;
    });

    listDiv.innerHTML = html;
}

// Sync data (placeholder for Firebase)
function syncData() {
    // This is a placeholder for future Firebase integration
    // For now, it just updates the sync status
    updateSyncStatus();
    alert('Sync functionality will be added with Firebase integration!');
}

// Update sync status
function updateSyncStatus() {
    const lastSync = localStorage.getItem('lastSync');
    const statusDiv = document.getElementById('syncStatus');
    
    if (lastSync) {
        const date = new Date(lastSync);
        statusDiv.textContent = `Last synced: ${date.toLocaleString()}`;
    } else {
        statusDiv.textContent = 'Last synced: Never (local only)';
    }
    
    localStorage.setItem('lastSync', new Date().toISOString());
}

// Allow Enter key to login
document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        login();
    }
});
