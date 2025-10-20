/**
 * @jest-environment jsdom
 */

// Import functions from app.js
const {
  validatePrice,
  validateBarcode,
  validateProductName,
  sanitizeHTML,
  hashPassword,
  getPrices,
  savePrices,
  getStorageItem,
  setStorageItem,
  getPricesForBarcode,
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
    // Skip these tests if crypto.subtle is not available (in test environment)
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

  // ===== STORAGE FUNCTIONS (with mocking) =====

  describe('Storage Functions', () => {
    beforeEach(() => {
      // Clear localStorage before each test
      localStorage.clear();
      jest.clearAllMocks();
    });

    afterEach(() => {
      // Restore all mocks after each test
      jest.restoreAllMocks();
    });

    describe('getPrices', () => {
      test('returns empty array when no prices stored', () => {
        expect(getPrices()).toEqual([]);
      });

      test('returns parsed prices from localStorage', () => {
        const mockPrices = [
          {
            barcode: '123',
            productName: 'Test',
            store: 'Store A',
            price: 10.99,
            date: '2024-01-01',
          },
        ];
        localStorage.setItem('prices', JSON.stringify(mockPrices));

        expect(getPrices()).toEqual(mockPrices);
      });

      test('handles corrupted data gracefully', () => {
        localStorage.setItem('prices', 'invalid json');
        expect(getPrices()).toEqual([]);
      });
    });

    describe('savePrices', () => {
      test('saves prices to localStorage', () => {
        const prices = [
          {
            barcode: '123',
            productName: 'Test',
            store: 'Store A',
            price: 10.99,
            date: '2024-01-01',
          },
        ];

        const result = savePrices(prices);
        expect(result).toBe(true);
        expect(JSON.parse(localStorage.getItem('prices'))).toEqual(prices);
      });

      test('returns false on storage error', () => {
        // Mock localStorage to throw an error
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('Storage full');
        });

        const result = savePrices([]);
        expect(result).toBe(false);

        // Clean up immediately after this test
        jest.restoreAllMocks();
      });
    });

    describe('getStorageItem', () => {
      test('retrieves item from localStorage', () => {
        localStorage.setItem('testKey', 'testValue');
        expect(getStorageItem('testKey')).toBe('testValue');
      });

      test('returns null for non-existent key', () => {
        expect(getStorageItem('nonexistent')).toBeNull();
      });
    });

    describe('setStorageItem', () => {
      test('sets item in localStorage', () => {
        const result = setStorageItem('testKey', 'testValue');
        expect(result).toBe(true);
        expect(localStorage.getItem('testKey')).toBe('testValue');
      });
    });
  });

  // ===== PRICE FILTERING =====

  describe('getPricesForBarcode', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test('returns prices for specific barcode', () => {
      const mockPrices = [
        {
          barcode: '123',
          productName: 'Product A',
          store: 'Store 1',
          price: 10.99,
          date: '2024-01-01',
        },
        {
          barcode: '456',
          productName: 'Product B',
          store: 'Store 2',
          price: 15.99,
          date: '2024-01-02',
        },
        {
          barcode: '123',
          productName: 'Product A',
          store: 'Store 3',
          price: 9.99,
          date: '2024-01-03',
        },
      ];
      localStorage.setItem('prices', JSON.stringify(mockPrices));

      const result = getPricesForBarcode('123');
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.barcode === '123')).toBe(true);
    });

    test('returns empty array for unknown barcode', () => {
      const mockPrices = [
        {
          barcode: '123',
          productName: 'Product A',
          store: 'Store 1',
          price: 10.99,
          date: '2024-01-01',
        },
      ];
      localStorage.setItem('prices', JSON.stringify(mockPrices));

      expect(getPricesForBarcode('999')).toEqual([]);
    });

    test('sorts prices by date descending', () => {
      const mockPrices = [
        {
          barcode: '123',
          productName: 'Product A',
          store: 'Store 1',
          price: 10.99,
          date: '2024-01-01',
        },
        {
          barcode: '123',
          productName: 'Product A',
          store: 'Store 2',
          price: 12.99,
          date: '2024-01-03',
        },
        {
          barcode: '123',
          productName: 'Product A',
          store: 'Store 3',
          price: 9.99,
          date: '2024-01-02',
        },
      ];
      localStorage.setItem('prices', JSON.stringify(mockPrices));

      const result = getPricesForBarcode('123');
      expect(new Date(result[0].date).getTime()).toBeGreaterThan(
        new Date(result[1].date).getTime()
      );
    });
  });
});
