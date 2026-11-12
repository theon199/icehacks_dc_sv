/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Resolve react-native-worklets to its JS (non-native) implementation under Jest.
  resolver: '<rootDir>/node_modules/react-native-worklets/jest/resolver.js',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.db$': '<rootDir>/test/assetStub.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/supabase/', '/tools/data/', '/dist/'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@shopify/flash-list|@kingstinct/.*|react-native-nitro-modules|@tanstack/.*|zustand|standard-navigation))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/app/**', '!**/*.test.{ts,tsx}'],
  clearMocks: true,
};
