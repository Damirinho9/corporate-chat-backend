#!/usr/bin/env node
/**
 * Phase 3 Test Runner (Cross-platform)
 * Runs only Phase 3 tests (Auto-assignment + SLA + Chatbot + Workflows)
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
    log('║       Phase 3: AI & Automation Test Suite                ║', 'blue');
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
        automation: false
    };

    // Run Phase 3 automation tests
    results.automation = await runTest(
        'tests/support/phase3-automation.test.js',
        'Phase 3: Automation Tests (Auto-assignment, SLA, Chatbot, Workflows)'
    );

    if (results.automation) {
        log('\n✅ Phase 3 Automation Tests Passed', 'green');
    } else {
        log('\n❌ Phase 3 Automation Tests Failed', 'red');
    }

    // Summary
    log('\n\n');
    log('═'.repeat(60), 'blue');
    log('📊 Phase 3 Test Summary', 'blue');
    log('═'.repeat(60), 'blue');
    log('');

    const allPassed = results.automation;

    if (allPassed) {
        log('✅ All Phase 3 Tests Passed!', 'green');
        log('');
        log('🎉 Phase 3 Features Working:', 'green');
        log('   • Auto-assignment engine', 'green');
        log('   • SLA monitoring & alerts', 'green');
        log('   • AI chatbot with intent detection', 'green');
        log('   • Workflow automation & webhooks', 'green');
        log('   • Complete automation lifecycle', 'green');
    } else {
        log('❌ Some Phase 3 Tests Failed', 'red');
        log('');
        log('Results:');
        log(`  ${results.automation ? '✅' : '❌'} Automation Tests`, results.automation ? 'green' : 'red');
    }

    log('');
    log('═'.repeat(60), 'blue');
    log('');

    // Quick test command
    log('💡 Quick commands:', 'yellow');
    log('   npm run test:phase3              - Run Phase 3 tests');
    log('   npm run test:phase2              - Run Phase 2 tests');
    log('   npm test                         - Run all tests');
    log('');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    log(`Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
