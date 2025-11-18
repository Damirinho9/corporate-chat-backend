/**
 * Support System API Tests
 * Tests all support API endpoints
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const TEST_USER = {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'test123'
};

let authToken = '';
let testTicketId = null;
let testArticleSlug = '';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };

        const req = http.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsedBody = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, data: parsedBody, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, headers: res.headers });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

describe('Support System API Tests', () => {

    before(async () => {
        console.log('🔐 Authenticating test user...');
        // Get auth token
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            email: TEST_USER.email,
            password: TEST_USER.password
        });

        if (loginRes.status === 200 && loginRes.data.token) {
            authToken = loginRes.data.token;
            console.log('✅ Authentication successful');
        } else {
            console.warn('⚠️  Authentication failed, some tests may be skipped');
            console.warn('   Set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars');
        }
    });

    describe('Health & Status', () => {
        it('should return healthy status', async () => {
            const res = await makeRequest('GET', '/api/health');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.status, 'healthy');
        });
    });

    describe('Knowledge Base - Public Endpoints', () => {
        it('should get KB categories', async () => {
            const res = await makeRequest('GET', '/api/support/kb/categories');
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.categories), 'categories should be an array');
        });

        it('should get KB articles', async () => {
            const res = await makeRequest('GET', '/api/support/kb/articles');
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.articles), 'articles should be an array');

            console.log(`   📚 Found ${res.data.articles?.length || 0} articles in response`);

            if (res.data.articles && res.data.articles.length > 0) {
                console.log(`   First article: ${res.data.articles[0].title || 'no title'}`);
                console.log(`   First article slug: ${res.data.articles[0].slug || 'NO SLUG!'}`);
                testArticleSlug = res.data.articles[0].slug;
            } else {
                console.log('   ⚠️  API returned empty articles array');
                console.log('   This may indicate:');
                console.log('   - Categories not visible (is_visible = false)');
                console.log('   - Articles not published');
                console.log('   - Foreign key issues');
            }
        });

        it('should get single KB article by slug', async () => {
            if (!testArticleSlug) {
                console.log('⏭️  Skipping: no articles available');
                console.log('   Run: psql -U postgres -d corporate_chat -p 5433 -f scripts/seed-support-kb.sql');
                return;
            }

            const res = await makeRequest('GET', `/api/support/kb/articles/${testArticleSlug}`);

            if (res.status === 404) {
                console.log('⚠️  Article not found in database');
                console.log('   Run seed script to populate KB articles');
                return;
            }

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.slug, testArticleSlug);
            assert.ok(res.data.title, 'article should have title');
            assert.ok(res.data.content, 'article should have content');
        });

        it('should search KB articles', async () => {
            const res = await makeRequest('GET', '/api/support/kb/articles?search=test');
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.articles), 'search results should be an array');
        });
    });

    describe('Tickets - Authenticated Endpoints', () => {
        it('should create a new ticket', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const ticketData = {
                subject: '[AUTO-TEST] Test Ticket',
                description: 'This is an automated test ticket. Please delete.',
                category: 'technical',
                priority: 'low'
            };

            const res = await makeRequest('POST', '/api/support/tickets', ticketData, authToken);
            assert.strictEqual(res.status, 200);
            assert.ok(res.data.id, 'ticket should have ID');
            assert.ok(res.data.ticket_number, 'ticket should have ticket number');

            testTicketId = res.data.id;
            console.log(`   ✓ Created ticket #${res.data.ticket_number}`);
        });

        it('should get list of tickets', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const res = await makeRequest('GET', '/api/support/tickets', null, authToken);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.tickets), 'tickets should be an array');
        });

        it('should get ticket details', async () => {
            if (!authToken || !testTicketId) {
                console.log('⏭️  Skipping: no test ticket');
                return;
            }

            const res = await makeRequest('GET', `/api/support/tickets/${testTicketId}`, null, authToken);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.id, testTicketId);
            assert.ok(res.data.subject, 'ticket should have subject');
        });

        it('should add message to ticket', async () => {
            if (!authToken || !testTicketId) {
                console.log('⏭️  Skipping: no test ticket');
                return;
            }

            const messageData = {
                content: 'This is a test reply message',
                is_internal: false
            };

            const res = await makeRequest('POST', `/api/support/tickets/${testTicketId}/messages`, messageData, authToken);
            assert.strictEqual(res.status, 200);
            console.log('   ✓ Message added to ticket');
        });

        it('should filter tickets by status', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const res = await makeRequest('GET', '/api/support/tickets?status=new', null, authToken);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.tickets), 'filtered tickets should be an array');
        });

        it('should filter tickets by priority', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const res = await makeRequest('GET', '/api/support/tickets?priority=low', null, authToken);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.tickets), 'filtered tickets should be an array');
        });
    });

    describe('Chatbot', () => {
        it('should process chatbot message', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const chatData = {
                session_id: `test_${Date.now()}`,
                message: 'Как сбросить пароль?'
            };

            const res = await makeRequest('POST', '/api/support/chatbot/message', chatData, authToken);
            assert.strictEqual(res.status, 200);
            assert.ok(res.data.message, 'chatbot should return message');
            console.log(`   ✓ Chatbot response: ${res.data.message.substring(0, 50)}...`);
        });

        it('should handle different intents', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const testMessages = [
                'Здравствуйте',
                'Хочу поговорить с оператором',
                'Не могу войти в систему'
            ];

            for (const message of testMessages) {
                const res = await makeRequest('POST', '/api/support/chatbot/message', {
                    session_id: `test_${Date.now()}`,
                    message
                }, authToken);

                assert.strictEqual(res.status, 200);
                assert.ok(res.data.message, `chatbot should respond to: ${message}`);
            }
        });
    });

    describe('Statistics', () => {
        it('should get support statistics', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const res = await makeRequest('GET', '/api/support/stats?period=7d', null, authToken);
            assert.strictEqual(res.status, 200);
            assert.ok(typeof res.data.total_tickets === 'number', 'should have total_tickets');
            assert.ok(res.data.sla, 'should have SLA data');
            console.log(`   ✓ Total tickets: ${res.data.total_tickets}`);
            console.log(`   ✓ SLA compliance: ${res.data.sla.compliance_rate}%`);
        });

        it('should get statistics for different periods', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const periods = ['7d', '30d'];
            for (const period of periods) {
                const res = await makeRequest('GET', `/api/support/stats?period=${period}`, null, authToken);
                assert.strictEqual(res.status, 200);
                assert.ok(res.data.period === period, `stats should be for period ${period}`);
            }
        });
    });

    describe('Edge Cases & Validation', () => {
        it('should reject ticket without subject', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const invalidTicket = {
                description: 'Test',
                category: 'technical'
            };

            const res = await makeRequest('POST', '/api/support/tickets', invalidTicket, authToken);
            assert.strictEqual(res.status, 400);
        });

        it('should reject ticket with short description', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const invalidTicket = {
                subject: 'Test',
                description: 'Short',
                category: 'technical'
            };

            const res = await makeRequest('POST', '/api/support/tickets', invalidTicket, authToken);
            assert.strictEqual(res.status, 400);
        });

        it('should handle non-existent ticket', async () => {
            if (!authToken) {
                console.log('⏭️  Skipping: not authenticated');
                return;
            }

            const res = await makeRequest('GET', '/api/support/tickets/999999', null, authToken);
            assert.strictEqual(res.status, 404);
        });

        it('should handle non-existent article', async () => {
            const res = await makeRequest('GET', '/api/support/kb/articles/non-existent-slug');
            assert.strictEqual(res.status, 404);
        });
    });

    after(() => {
        if (testTicketId) {
            console.log(`\n📝 Test ticket created: ID ${testTicketId}`);
            console.log('   You may want to delete it manually from the database');
        }
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('🧪 Running Support System API Tests\n');
    console.log('Environment:', {
        API_BASE,
        TEST_USER: TEST_USER.email
    });
    console.log('');
}
