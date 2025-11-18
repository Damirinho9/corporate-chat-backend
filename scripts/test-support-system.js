#!/usr/bin/env node
/**
 * Support System Test Script
 * Tests all components of the support system
 */

const axios = require('axios');

const API_BASE = process.env.API_URL || 'http://localhost:3000/api';
let authToken = '';
let testTicketId = null;
let testSessionId = `test_${Date.now()}`;

console.log('🧪 Support System Test Suite\n');
console.log('=' .repeat(60));

async function test() {
    try {
        // 1. Test Health
        console.log('\n1️⃣  Testing API Health...');
        const health = await axios.get(`${API_BASE}/health`);
        console.log('✅ API is healthy:', health.data);

        // 2. Login (use existing user)
        console.log('\n2️⃣  Testing Authentication...');
        console.log('⚠️  Please provide a test user token');
        console.log('   Set TOKEN environment variable or edit this script');
        authToken = process.env.TOKEN || 'YOUR_TOKEN_HERE';

        if (authToken === 'YOUR_TOKEN_HERE') {
            console.log('❌ No auth token provided. Skipping authenticated tests.');
            console.log('   Run: TOKEN=your_token node scripts/test-support-system.js');
            return;
        }

        const headers = { 'Authorization': `Bearer ${authToken}` };

        // 3. Test KB Categories
        console.log('\n3️⃣  Testing Knowledge Base Categories...');
        const categories = await axios.get(`${API_BASE}/support/kb/categories`);
        console.log(`✅ Found ${categories.data.categories?.length || 0} categories`);
        if (categories.data.categories?.length > 0) {
            console.log(`   - ${categories.data.categories[0].name}`);
        }

        // 4. Test KB Articles
        console.log('\n4️⃣  Testing Knowledge Base Articles...');
        const articles = await axios.get(`${API_BASE}/support/kb/articles`);
        console.log(`✅ Found ${articles.data.articles?.length || 0} articles`);
        if (articles.data.articles?.length > 0) {
            console.log(`   - ${articles.data.articles[0].title}`);
        }

        // 5. Create Test Ticket
        console.log('\n5️⃣  Creating Test Ticket...');
        const ticketData = {
            subject: 'Test Support Ticket',
            description: 'This is an automated test ticket created by the test script.\n\nPlease ignore or delete.',
            category: 'technical',
            priority: 'normal'
        };

        const ticketResponse = await axios.post(
            `${API_BASE}/support/tickets`,
            ticketData,
            { headers }
        );

        testTicketId = ticketResponse.data.id;
        console.log(`✅ Ticket created: #${ticketResponse.data.ticket_number}`);
        console.log(`   ID: ${testTicketId}`);

        // 6. Get Ticket Details
        console.log('\n6️⃣  Fetching Ticket Details...');
        const ticket = await axios.get(
            `${API_BASE}/support/tickets/${testTicketId}`,
            { headers }
        );
        console.log(`✅ Ticket details retrieved`);
        console.log(`   Subject: ${ticket.data.subject}`);
        console.log(`   Status: ${ticket.data.status}`);
        console.log(`   Priority: ${ticket.data.priority}`);

        // 7. Add Message to Ticket
        console.log('\n7️⃣  Adding Message to Ticket...');
        await axios.post(
            `${API_BASE}/support/tickets/${testTicketId}/messages`,
            {
                content: 'This is a test reply to the ticket.',
                is_internal: false
            },
            { headers }
        );
        console.log('✅ Message added to ticket');

        // 8. Test Chatbot
        console.log('\n8️⃣  Testing AI Chatbot...');
        const chatbotResponse = await axios.post(
            `${API_BASE}/support/chatbot/message`,
            {
                session_id: testSessionId,
                message: 'Здравствуйте, как сбросить пароль?'
            },
            { headers }
        );
        console.log('✅ Chatbot response received');
        console.log(`   Message: ${chatbotResponse.data.message.substring(0, 80)}...`);
        if (chatbotResponse.data.suggestions) {
            console.log(`   Suggestions: ${chatbotResponse.data.suggestions.length}`);
        }

        // 9. List My Tickets
        console.log('\n9️⃣  Listing My Tickets...');
        const myTickets = await axios.get(
            `${API_BASE}/support/tickets?assigned_to_me=false`,
            { headers }
        );
        console.log(`✅ Found ${myTickets.data.tickets?.length || 0} tickets`);

        // 10. Test Statistics
        console.log('\n🔟 Testing Support Statistics...');
        const stats = await axios.get(
            `${API_BASE}/support/stats?period=7d`,
            { headers }
        );
        console.log('✅ Statistics retrieved');
        console.log(`   Total Tickets: ${stats.data.total_tickets || 0}`);
        console.log(`   Avg Response Time: ${stats.data.avg_first_response_minutes || 0} min`);
        console.log(`   SLA Compliance: ${stats.data.sla?.compliance_rate || 0}%`);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('🎉 All Tests Passed!');
        console.log('='.repeat(60));
        console.log('\n📊 Test Summary:');
        console.log('✅ API Health Check');
        console.log('✅ Knowledge Base (Categories & Articles)');
        console.log('✅ Ticket Creation');
        console.log('✅ Ticket Messages');
        console.log('✅ AI Chatbot');
        console.log('✅ Ticket Listing');
        console.log('✅ Statistics & Analytics');

        console.log('\n🌐 Access URLs:');
        console.log(`   Customer Support: http://localhost:3000/support.html`);
        console.log(`   Agent Dashboard:  http://localhost:3000/support-agent.html`);

        console.log(`\n🎫 Test Ticket Created: #${ticketResponse.data.ticket_number}`);
        console.log(`   You can view it in the support interface`);

    } catch (error) {
        console.error('\n❌ Test Failed!');
        console.error('Error:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.error('\n🔐 Authentication failed. Please provide a valid token:');
            console.error('   TOKEN=your_token node scripts/test-support-system.js');
        }
        process.exit(1);
    }
}

test();
