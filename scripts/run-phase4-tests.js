#!/usr/bin/env node
/**
 * Phase 4 Test Runner (Cross-platform)
 * Runs only Phase 4 tests (Analytics + Email-to-Ticket + Self-Service Portal)
 */

const { spawn } = require('child_process');
const http = require('http');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkServerRunning() {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3000/api/health', (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function runTest(testFile, testName) {
    return new Promise((resolve) => {
        log(`\n${'═'.repeat(60)}`, 'blue');
        log(`🧪 Running ${testName}`, 'blue');
        log('═'.repeat(60), 'blue');
        log('');

        const testProcess = spawn('node', ['--test', testFile], {
            stdio: 'inherit',
            env: {
                ...process.env,
                API_URL: process.env.API_URL || 'http://localhost:3000',
                TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || 'test@example.com',
                TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || 'test123',
                ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@example.com',
                ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123'
            }
        });

        testProcess.on('close', (code) => {
            resolve(code === 0);
        });

        testProcess.on('error', (err) => {
            log(`Error running test: ${err.message}`, 'red');
            resolve(false);
        });
    });
}

async function main() {
    log('╔════════════════════════════════════════════════════════════╗', 'blue');
    log('║       Phase 4: Advanced Features Test Suite              ║', 'blue');
    log('╚════════════════════════════════════════════════════════════╝', 'blue');
    log('');

    // Check server
    log('🔍 Checking if server is running...', 'blue');
    const serverRunning = await checkServerRunning();

    if (!serverRunning) {
        log('❌ Server is not running!', 'red');
        log('   Please start the server first:', 'yellow');
        log('   npm start or pm2 start corporate-chat', 'yellow');
        process.exit(1);
    }

    log('✅ Server is running', 'green');
    log('');

    // Show configuration
    log('📋 Test Configuration:', 'blue');
    log(`   API URL: ${process.env.API_URL || 'http://localhost:3000'}`);
    log(`   Test User: ${process.env.TEST_USER_EMAIL || 'test@example.com'}`);
    log(`   Admin User: ${process.env.ADMIN_EMAIL || 'admin@example.com'}`);
    log('');

    const results = {
        analytics: false,
        emailToTicket: false,
        integration: false
    };

    // Run Phase 4 analytics tests
    results.analytics = await runTest(
        'tests/support/phase4-analytics.test.js',
        'Phase 4: Advanced Analytics Tests'
    );

    // Run Phase 4 email-to-ticket tests
    results.emailToTicket = await runTest(
        'tests/support/phase4-email-to-ticket.test.js',
        'Phase 4: Email-to-Ticket Service Tests'
    );

    // Run Phase 4 integration tests
    results.integration = await runTest(
        'tests/support/phase4-integration.test.js',
        'Phase 4: Integration Tests (Portal + Multi-channel + Real-time)'
    );

    // Individual test results
    log('\n\n');
    log('═'.repeat(60), 'blue');
    log('📊 Phase 4 Test Results', 'blue');
    log('═'.repeat(60), 'blue');
    log('');

    log(`  ${results.analytics ? '✅' : '❌'} Advanced Analytics Tests`, results.analytics ? 'green' : 'red');
    log(`  ${results.emailToTicket ? '✅' : '❌'} Email-to-Ticket Service Tests`, results.emailToTicket ? 'green' : 'red');
    log(`  ${results.integration ? '✅' : '❌'} Integration Tests`, results.integration ? 'green' : 'red');

    // Summary
    log('\n\n');
    log('═'.repeat(60), 'blue');
    log('📊 Phase 4 Test Summary', 'blue');
    log('═'.repeat(60), 'blue');
    log('');

    const allPassed = results.analytics && results.emailToTicket && results.integration;

    if (allPassed) {
        log('✅ All Phase 4 Tests Passed!', 'green');
        log('');
        log('🎉 Phase 4 Features Working:', 'green');
        log('   • Advanced analytics dashboard', 'green');
        log('   • Agent performance metrics', 'green');
        log('   • Ticket trends & CSAT analytics', 'green');
        log('   • Email-to-ticket integration', 'green');
        log('   • Category & priority auto-detection', 'green');
        log('   • Self-service customer portal', 'green');
        log('   • Multi-channel support tracking', 'green');
        log('   • Real-time analytics updates', 'green');
    } else {
        log('❌ Some Phase 4 Tests Failed', 'red');
        log('');
        log('Results:');
        log(`  ${results.analytics ? '✅' : '❌'} Analytics Tests`, results.analytics ? 'green' : 'red');
        log(`  ${results.emailToTicket ? '✅' : '❌'} Email-to-Ticket Tests`, results.emailToTicket ? 'green' : 'red');
        log(`  ${results.integration ? '✅' : '❌'} Integration Tests`, results.integration ? 'green' : 'red');
    }

    log('');
    log('═'.repeat(60), 'blue');
    log('');

    // Quick test commands
    log('💡 Quick commands:', 'yellow');
    log('   npm run test:phase4              - Run Phase 4 tests');
    log('   npm run test:phase4:analytics    - Run analytics tests only');
    log('   npm run test:phase4:email        - Run email-to-ticket tests only');
    log('   npm run test:phase4:integration  - Run integration tests only');
    log('   npm test                         - Run all tests');
    log('');

    // Phase completion status
    log('🏆 Support System Phase Status:', 'blue');
    log('   ✅ Phase 1: Core Support System', 'green');
    log('   ✅ Phase 2: Email + Real-time Socket.IO', 'green');
    log('   ✅ Phase 3: AI + Automation', 'green');
    log(`   ${allPassed ? '✅' : '⏳'} Phase 4: Advanced Features`, allPassed ? 'green' : 'yellow');
    log('');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    log(`Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
