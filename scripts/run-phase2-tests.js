#!/usr/bin/env node
/**
 * Phase 2 Test Runner (Cross-platform)
 * Runs only Phase 2 tests (Email + Socket.IO + Integration)
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
                TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || 'test123'
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
    log('║       Phase 2: Email + Socket.IO Test Suite               ║', 'blue');
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
    log(`   SMTP Configured: ${process.env.SMTP_PASS ? 'Yes' : 'No (emails will be skipped)'}`);
    log('');

    const results = {
        email: false,
        socketio: false,
        integration: false
    };

    // Run Email tests
    results.email = await runTest('tests/support/phase2-email.test.js', 'Phase 2: Email Notification Tests');

    if (results.email) {
        log('\n✅ Email Tests Passed', 'green');
    } else {
        log('\n❌ Email Tests Failed', 'red');
    }

    log('\n\n');

    // Run Socket.IO tests
    results.socketio = await runTest('tests/support/phase2-socketio.test.js', 'Phase 2: Socket.IO Event Tests');

    if (results.socketio) {
        log('\n✅ Socket.IO Tests Passed', 'green');
    } else {
        log('\n❌ Socket.IO Tests Failed', 'red');
    }

    log('\n\n');

    // Run Integration tests
    results.integration = await runTest('tests/support/phase2-integration.test.js', 'Phase 2: Integration Tests');

    if (results.integration) {
        log('\n✅ Integration Tests Passed', 'green');
    } else {
        log('\n❌ Integration Tests Failed', 'red');
    }

    // Summary
    log('\n\n');
    log('═'.repeat(60), 'blue');
    log('📊 Phase 2 Test Summary', 'blue');
    log('═'.repeat(60), 'blue');
    log('');

    const allPassed = results.email && results.socketio && results.integration;

    if (allPassed) {
        log('✅ All Phase 2 Tests Passed!', 'green');
        log('');
        log('🎉 Phase 2 Features Working:', 'green');
        log('   • Email notifications (4 types)', 'green');
        log('   • Socket.IO real-time events (6 types)', 'green');
        log('   • End-to-end integration', 'green');
        log('   • Typing indicators', 'green');
        log('   • Multi-agent collaboration', 'green');
    } else {
        log('❌ Some Phase 2 Tests Failed', 'red');
        log('');
        log('Results:');
        log(`  ${results.email ? '✅' : '❌'} Email Notifications`, results.email ? 'green' : 'red');
        log(`  ${results.socketio ? '✅' : '❌'} Socket.IO Events`, results.socketio ? 'green' : 'red');
        log(`  ${results.integration ? '✅' : '❌'} Integration Tests`, results.integration ? 'green' : 'red');
    }

    log('');
    log('═'.repeat(60), 'blue');
    log('');

    // Quick test command
    log('💡 Quick commands:', 'yellow');
    log('   npm run test:phase2              - Run all Phase 2 tests');
    log('   npm run test:phase2:email        - Run email tests only');
    log('   npm run test:phase2:socketio     - Run Socket.IO tests only');
    log('   npm run test:phase2:integration  - Run integration tests only');
    log('');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    log(`Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
