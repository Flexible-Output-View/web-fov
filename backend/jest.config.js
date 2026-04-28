export default {
    testEnvironment: 'node',
    coverageDirectory: './coverage',
    collectCoverageFrom: [
        'src/**/*.js',
        'src/**/*.mjs',
        '!src/index.js',
        '!src/mediaServer.mjs',
        '!**/node_modules/**'
    ],
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/src/**/*.test.js'
    ],
    transformIgnorePatterns: [
        'node_modules/(?!(mysql2)/)'
    ],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    }
};
