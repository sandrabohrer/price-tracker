module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: ['app.js', '!node_modules/**', '!jest.config.js'],
  coverageThreshold: {
    global: {
      branches: 33,
      functions: 26,
      lines: 21,
      statements: 21,
    },
  },
};
