#!/usr/bin/env node
/**
 * Support System Test Runner (Cross-platform)
 * Runs all automated tests and generates a report
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
    log('║       Support System Automated Test Suite                 ║', 'blue');
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
    log('');

    const results = {
        api: false,
        workflow: false
    };

    // Run API tests
    results.api = await runTest('tests/support/api.test.js', 'API Tests');

    if (results.api) {
        log('\n✅ API Tests Passed', 'green');
    } else {
        log('\n❌ API Tests Failed', 'red');
    }

    log('\n\n');

    // Run workflow tests
    results.workflow = await runTest('tests/support/workflow.test.js', 'Workflow Integration Tests');

    if (results.workflow) {
        log('\n✅ Workflow Tests Passed', 'green');
    } else {
        log('\n❌ Workflow Tests Failed', 'red');
    }

    // Summary
    log('\n\n');
    log('═'.repeat(60), 'blue');
    log('📊 Test Summary', 'blue');
    log('═'.repeat(60), 'blue');
    log('');

    const allPassed = results.api && results.workflow;

    if (allPassed) {
        log('✅ All Tests Passed!', 'green');
        log('');
        log('🎉 Support system is working correctly', 'green');
    } else {
        log('❌ Some Tests Failed', 'red');
        log('');
        log('Results:');
        log(`  ${results.api ? '✅' : '❌'} API Tests`, results.api ? 'green' : 'red');
        log(`  ${results.workflow ? '✅' : '❌'} Workflow Tests`, results.workflow ? 'green' : 'red');
    }

    log('');
    log('═'.repeat(60), 'blue');
    log('');

    // Quick test command
    log('💡 Quick commands:', 'yellow');
    log('   npm test              - Run all tests');
    log('   npm run test:support  - Run support tests only');
    log('   npm run test:api      - Run API tests only');
    log('');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    log(`Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
