/**
 * @jest-environment jsdom
 */

// Import functions from app.js
const {
  PriceTrackerDB,
  validatePrice,
  validateBarcode,
  validateProductName,
  sanitizeHTML,
  hashPassword,
} = require('./app.js');

// Mock DOM elements needed for error messages
beforeAll(() => {
  document.body.innerHTML = `
    <div id="errorToast"></div>
    <div id="successToast"></div>
  `;
});

describe('Price Tracker App', () => {
  // ===== VALIDATION FUNCTIONS =====

  describe('validatePrice', () => {
    test('accepts valid positive prices', () => {
      expect(validatePrice('10.99').valid).toBe(true);
      expect(validatePrice('10.99').value).toBe(10.99);
      expect(validatePrice('100').valid).toBe(true);
      expect(validatePrice('0.01').valid).toBe(true);
    });

    test('rejects zero price', () => {
      const result = validatePrice('0');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('rejects negative prices', () => {
      const result = validatePrice('-5.99');
      expect(result.valid).toBe(false);
    });

    test('rejects non-numeric values', () => {
      expect(validatePrice('abc').valid).toBe(false);
      expect(validatePrice('').valid).toBe(false);
      expect(validatePrice('$10.99').valid).toBe(false);
    });
  });

  describe('validateBarcode', () => {
    test('accepts valid barcodes', () => {
      expect(validateBarcode('123456789').valid).toBe(true);
      expect(validateBarcode('ABC123').valid).toBe(true);
      expect(validateBarcode('   12345   ').valid).toBe(true);
    });

    test('rejects short barcodes', () => {
      expect(validateBarcode('12').valid).toBe(false);
      expect(validateBarcode('AB').valid).toBe(false);
    });

    test('rejects empty barcodes', () => {
      expect(validateBarcode('').valid).toBe(false);
      expect(validateBarcode('   ').valid).toBe(false);
    });

    test('trims whitespace from valid barcodes', () => {
      const result = validateBarcode('  ABC123  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('ABC123');
    });
  });

  describe('validateProductName', () => {
    test('accepts valid product names', () => {
      expect(validateProductName('Milk').valid).toBe(true);
      expect(validateProductName('Coca Cola').valid).toBe(true);
      expect(validateProductName('  Bread  ').valid).toBe(true);
    });

    test('rejects short product names', () => {
      expect(validateProductName('A').valid).toBe(false);
      expect(validateProductName('').valid).toBe(false);
    });

    test('trims whitespace from valid names', () => {
      const result = validateProductName('  Milk  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Milk');
    });
  });

  // ===== UTILITY FUNCTIONS =====

  describe('sanitizeHTML', () => {
    test('escapes HTML special characters', () => {
      expect(sanitizeHTML('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert("xss")&lt;/script&gt;'
      );
      expect(sanitizeHTML('Normal text')).toBe('Normal text');
      expect(sanitizeHTML('<b>Bold</b>')).toBe('&lt;b&gt;Bold&lt;/b&gt;');
    });

    test('handles empty strings', () => {
      expect(sanitizeHTML('')).toBe('');
    });

    test('escapes dangerous characters', () => {
      expect(sanitizeHTML('<>"&')).toContain('&lt;');
      expect(sanitizeHTML('<>"&')).toContain('&gt;');
    });
  });

  // ===== PASSWORD FUNCTIONS =====

  describe('hashPassword', () => {
    const cryptoAvailable = typeof crypto !== 'undefined' && crypto.subtle;

    test('produces consistent hash for same password', async () => {
      if (!cryptoAvailable) {
        console.log('Skipping: crypto.subtle not available in test environment');
        return;
      }

      const hash1 = await hashPassword('testpassword');
      const hash2 = await hashPassword('testpassword');
      expect(hash1).toBe(hash2);
    });

    test('produces different hashes for different passwords', async () => {
      if (!cryptoAvailable) {
        console.log('Skipping: crypto.subtle not available in test environment');
        return;
      }

      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');
      expect(hash1).not.toBe(hash2);
    });

    test('produces 64-character hex string', async () => {
      if (!cryptoAvailable) {
        console.log('Skipping: crypto.subtle not available in test environment');
        return;
      }

      const hash = await hashPassword('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  // ===== PRICE TRACKER DATABASE CLASS =====

  describe('PriceTrackerDB', () => {
    let db;

    beforeEach(() => {
      localStorage.clear();
      db = new PriceTrackerDB();
    });

    afterEach(() => {
      localStorage.clear();
    });

    describe('initialization', () => {
      test('creates empty data structure when no data exists', () => {
        expect(db.data.products).toEqual({});
        expect(db.data.productVariants).toEqual({});
        expect(db.data.prices).toEqual({});
        expect(db.data.priceHistory).toEqual({});
      });

      test('loads existing data from localStorage', () => {
        const testData = {
          products: { 123: { barcode: '123', productName: 'Test' } },
          productVariants: {},
          prices: {},
          priceHistory: {},
        };
        localStorage.setItem('priceTrackerData', JSON.stringify(testData));

        const newDb = new PriceTrackerDB();
        expect(newDb.data.products['123'].productName).toBe('Test');
      });
    });

    describe('parseSize', () => {
      test('parses valid size strings', () => {
        expect(db.parseSize('16oz')).toEqual({ value: 16, unit: 'oz' });
        expect(db.parseSize('2.5lb')).toEqual({ value: 2.5, unit: 'lb' });
        expect(db.parseSize('500ml')).toEqual({ value: 500, unit: 'ml' });
        expect(db.parseSize('1.5L')).toEqual({ value: 1.5, unit: 'l' });
      });

      test('handles size strings with spaces', () => {
        expect(db.parseSize('16 oz')).toEqual({ value: 16, unit: 'oz' });
        expect(db.parseSize('2.5 lb')).toEqual({ value: 2.5, unit: 'lb' });
      });

      test('returns null for empty or invalid strings', () => {
        expect(db.parseSize('')).toEqual({ value: null, unit: null });
        expect(db.parseSize('   ')).toEqual({ value: null, unit: null });
      });

      test('handles strings without numbers', () => {
        const result = db.parseSize('large');
        expect(result.value).toBeNull();
        expect(result.unit).toBe('large');
      });
    });

    describe('calculateUnitPrice', () => {
      test('calculates unit price correctly', () => {
        expect(db.calculateUnitPrice(3.99, 16)).toBe(0.2494);
        expect(db.calculateUnitPrice(10, 5)).toBe(2);
        expect(db.calculateUnitPrice(5.99, 8)).toBe(0.7488);
      });

      test('returns null for invalid inputs', () => {
        expect(db.calculateUnitPrice(10, 0)).toBeNull();
        expect(db.calculateUnitPrice(10, null)).toBeNull();
      });

      test('rounds to 4 decimal places', () => {
        const result = db.calculateUnitPrice(1, 3);
        expect(result.toString()).toMatch(/^\d+\.\d{4}$/);
      });
    });

    describe('addProduct', () => {
      test('creates new product', () => {
        const product = db.addProduct('123', 'Coffee Creamer', 'Brand X');

        expect(product.barcode).toBe('123');
        expect(product.productName).toBe('Coffee Creamer');
        expect(product.brand).toBe('Brand X');
        expect(product.createdAt).toBeDefined();
        expect(product.updatedAt).toBeDefined();
      });

      test('updates existing product', () => {
        db.addProduct('123', 'Old Name', 'Old Brand');
        const updated = db.addProduct('123', 'New Name', 'New Brand');

        expect(updated.productName).toBe('New Name');
        expect(updated.brand).toBe('New Brand');
        expect(Object.keys(db.data.products)).toHaveLength(1);
      });

      test('saves to localStorage', () => {
        db.addProduct('123', 'Test Product');

        const saved = JSON.parse(localStorage.getItem('priceTrackerData'));
        expect(saved.products['123'].productName).toBe('Test Product');
      });
    });

    describe('addProductVariant', () => {
      test('creates new variant with size', () => {
        const variant = db.addProductVariant('123', '16oz');

        expect(variant.barcode).toBe('123');
        expect(variant.size).toBe('16oz');
        expect(variant.sizeValue).toBe(16);
        expect(variant.sizeUnit).toBe('oz');
      });

      test('handles variant without size', () => {
        const variant = db.addProductVariant('123', '');

        expect(variant.size).toBe('');
        expect(variant.sizeValue).toBeNull();
      });

      test('does not duplicate variants', () => {
        db.addProductVariant('123', '16oz');
        db.addProductVariant('123', '16oz');

        expect(Object.keys(db.data.productVariants)).toHaveLength(1);
      });
    });

    describe('addPrice', () => {
      test('adds new price entry', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');

        expect(price.barcode).toBe('123');
        expect(price.store).toBe('Aldi');
        expect(price.price).toBe(2.99);
        expect(price.isCurrentPrice).toBe(true);
        expect(price.unitPrice).toBeDefined();
      });

      test('calculates unit price when size provided', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 3.99, '16oz');

        expect(price.unitPrice).toBe(0.2494);
      });

      test('marks previous price as not current', () => {
        const price1 = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        const price2 = db.addPrice('123', 'Coffee', 'Aldi', 3.49, '8oz');

        expect(db.data.prices[price1.id].isCurrentPrice).toBe(false);
        expect(db.data.prices[price2.id].isCurrentPrice).toBe(true);
      });

      test('adds entry to price history', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');

        const historyKey = '123_8oz_Aldi';
        expect(db.data.priceHistory[historyKey]).toHaveLength(1);
        expect(db.data.priceHistory[historyKey][0].price).toBe(2.99);
      });

      test('creates product and variant automatically', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');

        expect(db.data.products['123']).toBeDefined();
        expect(db.data.productVariants['123_8oz']).toBeDefined();
      });

      test('handles different stores for same product/size', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Walmart', 3.49, '8oz');

        const aldiPrices = Object.values(db.data.prices).filter(
          (p) => p.store === 'Aldi' && p.isCurrentPrice
        );
        const walmartPrices = Object.values(db.data.prices).filter(
          (p) => p.store === 'Walmart' && p.isCurrentPrice
        );

        expect(aldiPrices).toHaveLength(1);
        expect(walmartPrices).toHaveLength(1);
      });

      test('handles different sizes for same product/store', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 4.99, '16oz');

        const currentPrices = db.getAllCurrentPricesForBarcode('123');
        expect(currentPrices).toHaveLength(2);
      });
    });

    describe('updatePrice', () => {
      test('updates existing price', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.updatePrice(price.id, 3.49);

        expect(db.data.prices[price.id].price).toBe(3.49);
      });

      test('recalculates unit price', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.updatePrice(price.id, 4.0);

        expect(db.data.prices[price.id].unitPrice).toBe(0.5);
      });

      test('updates timestamp', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        const originalDate = price.date;

        // Wait a tiny bit to ensure different timestamp
        setTimeout(() => {
          db.updatePrice(price.id, 3.49);
          expect(db.data.prices[price.id].date).not.toBe(originalDate);
        }, 10);
      });

      test('updates history entry', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.updatePrice(price.id, 3.49);

        const historyKey = '123_8oz_Aldi';
        expect(db.data.priceHistory[historyKey][0].price).toBe(3.49);
      });

      test('throws error for non-existent price', () => {
        expect(() => {
          db.updatePrice('invalid-id', 10);
        }).toThrow('Price entry not found');
      });
    });

    describe('getAllCurrentPricesForBarcode', () => {
      test('returns all current prices for barcode', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Walmart', 3.49, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 4.99, '16oz');

        const prices = db.getAllCurrentPricesForBarcode('123');
        expect(prices).toHaveLength(3);
        expect(prices.every((p) => p.isCurrentPrice)).toBe(true);
      });

      test('excludes non-current prices', () => {
        const price1 = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 3.49, '8oz');

        const prices = db.getAllCurrentPricesForBarcode('123');
        expect(prices).toHaveLength(1);
        expect(prices.find((p) => p.id === price1.id)).toBeUndefined();
      });

      test('sorts by price ascending', () => {
        db.addPrice('123', 'Coffee', 'Walmart', 3.49, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Target', 3.99, '8oz');

        const prices = db.getAllCurrentPricesForBarcode('123');
        expect(prices[0].price).toBe(2.99);
        expect(prices[1].price).toBe(3.49);
        expect(prices[2].price).toBe(3.99);
      });

      test('returns empty array for unknown barcode', () => {
        const prices = db.getAllCurrentPricesForBarcode('999');
        expect(prices).toEqual([]);
      });
    });

    describe('getPriceHistory', () => {
      test('returns history for specific product/store/size', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 3.49, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 3.99, '8oz');

        const history = db.getPriceHistory('123', 'Aldi', '8oz');
        expect(history).toHaveLength(3);
        expect(history.map((h) => h.price)).toEqual([2.99, 3.49, 3.99]);
      });

      test('returns empty array for no history', () => {
        const history = db.getPriceHistory('123', 'Aldi', '8oz');
        expect(history).toEqual([]);
      });

      test('separates history by size', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.addPrice('123', 'Coffee', 'Aldi', 4.99, '16oz');

        const history8oz = db.getPriceHistory('123', 'Aldi', '8oz');
        const history16oz = db.getPriceHistory('123', 'Aldi', '16oz');

        expect(history8oz).toHaveLength(1);
        expect(history16oz).toHaveLength(1);
        expect(history8oz[0].price).toBe(2.99);
        expect(history16oz[0].price).toBe(4.99);
      });
    });

    describe('deletePrice', () => {
      test('removes price entry', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        const deleted = db.deletePrice(price.id);

        expect(deleted).toBe(true);
        expect(db.data.prices[price.id]).toBeUndefined();
      });

      test('removes from price history', () => {
        const price = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        db.deletePrice(price.id);

        const historyKey = '123_8oz_Aldi';
        expect(db.data.priceHistory[historyKey]).toBeUndefined();
      });

      test('cleans up empty history arrays', () => {
        const price1 = db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');
        const price2 = db.addPrice('123', 'Coffee', 'Aldi', 3.49, '8oz');

        db.deletePrice(price1.id);
        const historyKey = '123_8oz_Aldi';
        expect(db.data.priceHistory[historyKey]).toHaveLength(1);

        db.deletePrice(price2.id);
        expect(db.data.priceHistory[historyKey]).toBeUndefined();
      });

      test('returns false for non-existent price', () => {
        const result = db.deletePrice('invalid-id');
        expect(result).toBe(false);
      });
    });

    describe('exportForFirebase', () => {
      test('includes all data and timestamp', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');

        const exported = db.exportForFirebase();

        expect(exported.products).toBeDefined();
        expect(exported.productVariants).toBeDefined();
        expect(exported.prices).toBeDefined();
        expect(exported.priceHistory).toBeDefined();
        expect(exported.lastSync).toBeDefined();
      });

      test('timestamp is ISO format', () => {
        const exported = db.exportForFirebase();
        expect(exported.lastSync).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    describe('saveData and persistence', () => {
      test('persists data to localStorage', () => {
        db.addPrice('123', 'Coffee', 'Aldi', 2.99, '8oz');

        const newDb = new PriceTrackerDB();
        const prices = newDb.getAllCurrentPricesForBarcode('123');

        expect(prices).toHaveLength(1);
        expect(prices[0].price).toBe(2.99);
      });

      test('handles localStorage errors gracefully', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('Storage full');
        });

        const result = db.saveData();
        expect(result).toBe(false);

        jest.restoreAllMocks();
      });
    });
  });
});
