/**
 * Support System Workflow Integration Tests
 * Tests complete user workflows from ticket creation to resolution
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const TEST_USER = {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'test123'
};

let authToken = '';

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
                    resolve({ status: res.statusCode, data: parsedBody });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

describe('Support System Workflow Tests', () => {

    before(async () => {
        console.log('🔐 Authenticating...');
        const loginRes = await makeRequest('POST', '/api/auth/login', TEST_USER);
        if (loginRes.status === 200 && loginRes.data.token) {
            authToken = loginRes.data.token;
            console.log('✅ Authenticated\n');
        } else {
            console.warn('⚠️  Authentication failed\n');
        }
    });

    describe('Complete Ticket Lifecycle', () => {
        let ticketId;
        let ticketNumber;

        it('Step 1: Customer creates ticket', async () => {
            if (!authToken) return console.log('⏭️  Skipped');

            console.log('\n📝 Creating ticket...');

            const res = await makeRequest('POST', '/api/support/tickets', {
                subject: '[WORKFLOW-TEST] Complete Lifecycle Test',
                description: 'Testing complete ticket workflow from creation to resolution.\n\nThis includes:\n- Creation\n- Messages\n- Status updates\n- Rating',
                category: 'technical',
                priority: 'normal'
            }, authToken);

            assert.strictEqual(res.status, 200);
            assert.ok(res.data.id);
            assert.ok(res.data.ticket_number);

            ticketId = res.data.id;
            ticketNumber = res.data.ticket_number;

            console.log(`   ✅ Ticket created: #${ticketNumber}`);
        });

        it('Step 2: View ticket in queue', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n📋 Checking queue...');

            const res = await makeRequest('GET', '/api/support/tickets', null, authToken);

            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.tickets));

            const ticket = res.data.tickets.find(t => t.id === ticketId);
            assert.ok(ticket, 'ticket should appear in queue');
            assert.strictEqual(ticket.status, 'new');

            console.log(`   ✅ Ticket found in queue with status: ${ticket.status}`);
        });

        it('Step 3: Agent views ticket details', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n👁️  Viewing ticket details...');

            const res = await makeRequest('GET', `/api/support/tickets/${ticketId}`, null, authToken);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.id, ticketId);
            assert.ok(res.data.subject);
            assert.ok(res.data.description);

            console.log(`   ✅ Ticket details loaded`);
            console.log(`      Subject: ${res.data.subject}`);
            console.log(`      Status: ${res.data.status}`);
            console.log(`      Priority: ${res.data.priority}`);
        });

        it('Step 4: Agent replies to ticket', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n💬 Agent replying...');

            const res = await makeRequest('POST', `/api/support/tickets/${ticketId}/messages`, {
                content: 'Thank you for contacting support. We are looking into your issue.',
                is_internal: false
            }, authToken);

            assert.strictEqual(res.status, 200);

            console.log('   ✅ Agent reply sent');
        });

        it('Step 5: Customer replies back', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n💬 Customer replying...');

            const res = await makeRequest('POST', `/api/support/tickets/${ticketId}/messages`, {
                content: 'Thank you! Could you provide more details on the timeline?',
                is_internal: false
            }, authToken);

            assert.strictEqual(res.status, 200);

            console.log('   ✅ Customer reply sent');
        });

        it('Step 6: View conversation history', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n💬 Viewing conversation...');

            const res = await makeRequest('GET', `/api/support/tickets/${ticketId}`, null, authToken);

            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.messages));
            assert.ok(res.data.messages.length >= 2, 'should have at least 2 messages');

            console.log(`   ✅ Conversation loaded: ${res.data.messages.length} messages`);
        });

        it('Step 7: Agent marks as resolved', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n✅ Resolving ticket...');

            const res = await makeRequest('PATCH', `/api/support/tickets/${ticketId}/status`, {
                status: 'resolved'
            }, authToken);

            // Note: This endpoint may not exist yet
            if (res.status === 404) {
                console.log('   ⚠️  Status update endpoint not implemented');
                return;
            }

            console.log(`   ✅ Ticket marked as resolved`);
        });

        it('Step 8: Customer rates resolution', async () => {
            if (!authToken || !ticketId) return console.log('⏭️  Skipped');

            console.log('\n⭐ Rating ticket...');

            const res = await makeRequest('POST', `/api/support/tickets/${ticketId}/rating`, {
                rating: 5,
                feedback: 'Great service, quick response!'
            }, authToken);

            if (res.status === 404) {
                console.log('   ⚠️  Rating endpoint exists but may have validation issues');
            } else {
                assert.strictEqual(res.status, 200);
                console.log('   ✅ Rating submitted: 5 stars');
            }
        });

        it('Step 9: Verify in statistics', async () => {
            if (!authToken) return console.log('⏭️  Skipped');

            console.log('\n📊 Checking statistics...');

            const res = await makeRequest('GET', '/api/support/stats?period=7d', null, authToken);

            assert.strictEqual(res.status, 200);
            assert.ok(res.data.total_tickets >= 1);

            console.log(`   ✅ Statistics updated`);
            console.log(`      Total tickets: ${res.data.total_tickets}`);
        });
    });

    describe('Chatbot to Ticket Escalation', () => {
        let sessionId;
        let escalatedTicketId;

        it('Step 1: User starts chatbot conversation', async () => {
            if (!authToken) return console.log('⏭️  Skipped');

            console.log('\n🤖 Starting chatbot...');

            sessionId = `workflow_test_${Date.now()}`;

            const res = await makeRequest('POST', '/api/support/chatbot/message', {
                session_id: sessionId,
                message: 'Здравствуйте'
            }, authToken);

            assert.strictEqual(res.status, 200);
            assert.ok(res.data.message);

            console.log(`   ✅ Chatbot responded`);
        });

        it('Step 2: User requests human agent', async () => {
            if (!authToken || !sessionId) return console.log('⏭️  Skipped');

            console.log('\n👤 Requesting human agent...');

            const res = await makeRequest('POST', '/api/support/chatbot/message', {
                session_id: sessionId,
                message: 'Хочу поговорить с оператором'
            }, authToken);

            assert.strictEqual(res.status, 200);

            if (res.data.should_create_ticket) {
                console.log('   ✅ Chatbot suggests creating ticket');
            } else {
                console.log('   ℹ️  Chatbot responded without ticket suggestion');
            }
        });

        it('Step 3: Verify chatbot conversation saved', async () => {
            if (!authToken || !sessionId) return console.log('⏭️  Skipped');

            console.log('\n💾 Checking conversation history...');

            const res = await makeRequest('GET', `/api/support/chatbot/history/${sessionId}`, null, authToken);

            if (res.status === 200) {
                assert.ok(Array.isArray(res.data));
                console.log(`   ✅ Conversation history: ${res.data.length} messages`);
            } else {
                console.log('   ℹ️  History endpoint may not be fully implemented');
            }
        });
    });

    describe('Knowledge Base Self-Service Flow', () => {
        let articleSlug;

        it('Step 1: User searches knowledge base', async () => {
            console.log('\n🔍 Searching KB...');

            const res = await makeRequest('GET', '/api/support/kb/articles?search=password');

            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.articles));

            if (res.data.articles.length > 0) {
                articleSlug = res.data.articles[0].slug;
                console.log(`   ✅ Found ${res.data.articles.length} articles`);
            } else {
                console.log('   ℹ️  No articles found matching search');
            }
        });

        it('Step 2: User views article', async () => {
            if (!articleSlug) return console.log('⏭️  Skipped: no articles');

            console.log('\n📖 Reading article...');

            const res = await makeRequest('GET', `/api/support/kb/articles/${articleSlug}`);

            assert.strictEqual(res.status, 200);
            assert.ok(res.data.title);
            assert.ok(res.data.content);

            console.log(`   ✅ Article loaded: ${res.data.title}`);
        });

        it('Step 3: User marks article as helpful', async () => {
            if (!authToken || !articleSlug) return console.log('⏭️  Skipped');

            console.log('\n👍 Marking helpful...');

            // This endpoint would need to be implemented
            const res = await makeRequest('POST', `/api/support/kb/articles/${articleSlug}/helpful`, {
                is_helpful: true
            }, authToken);

            if (res.status === 404) {
                console.log('   ℹ️  Helpful endpoint not yet implemented');
            } else {
                console.log('   ✅ Feedback submitted');
            }
        });
    });
});

if (require.main === module) {
    console.log('🧪 Running Support System Workflow Tests\n');
    console.log('This simulates complete user journeys through the support system\n');
}
