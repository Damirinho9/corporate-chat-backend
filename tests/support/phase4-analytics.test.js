// ==================== PHASE 4: ANALYTICS TESTS ====================
// Tests for advanced analytics endpoints
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fetch = require('node-fetch');

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'test@example.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'test123';

let adminToken = null;
let userToken = null;

// Helper function to make authenticated API calls
async function apiCall(endpoint, token, options = {}) {
    const response = await fetch(`${API_URL}/api${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            ...options.headers
        }
    });

    const data = await response.json();
    return { response, data };
}

// ==================== SETUP ====================

before(async () => {
    console.log('\n📊 Phase 4: Analytics Test Suite');
    console.log('═'.repeat(60));

    // Authenticate admin
    try {
        const adminLoginResponse = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD
            })
        });

        if (adminLoginResponse.ok) {
            const adminData = await adminLoginResponse.json();
            adminToken = adminData.token;
            console.log('✅ Admin user authenticated');
        }
    } catch (error) {
        console.log('⚠️ Admin authentication failed - analytics tests may be skipped');
    }

    // Authenticate regular user
    try {
        const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: TEST_USER_EMAIL,
                password: TEST_USER_PASSWORD
            })
        });

        if (loginResponse.ok) {
            const loginData = await loginResponse.json();
            userToken = loginData.token;
            console.log('✅ Test user authenticated');
        }
    } catch (error) {
        console.log('⚠️ Test user authentication failed');
    }

    console.log('');
});

// ==================== AGENT PERFORMANCE ANALYTICS ====================

describe('Agent Performance Analytics', () => {
    it('should require admin authentication', async () => {
        const { response } = await apiCall('/support/analytics/agents', userToken);

        // Non-admin should be denied
        assert.strictEqual(response.status === 401 || response.status === 403, true,
            'Should deny access to non-admin users');

        console.log('✅ Agent analytics requires admin authentication');
    });

    it('should return agent performance metrics', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const { response, data } = await apiCall('/support/analytics/agents?period=30', adminToken);

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.strictEqual(data.success, true, 'Response should indicate success');
        assert.ok(Array.isArray(data.agents), 'Should return agents array');
        assert.strictEqual(data.period_days, 30, 'Should return correct period');

        if (data.agents.length > 0) {
            const agent = data.agents[0];

            // Verify agent performance fields
            assert.ok(agent.agent_id, 'Agent should have ID');
            assert.ok(agent.agent_name, 'Agent should have name');
            assert.ok(agent.agent_email, 'Agent should have email');
            assert.ok(typeof agent.total_tickets === 'number', 'Should have total tickets count');
            assert.ok(typeof agent.tickets_resolved === 'number', 'Should have resolved tickets count');
            assert.ok(typeof agent.tickets_active === 'number', 'Should have active tickets count');
            assert.ok(typeof agent.avg_first_response_minutes === 'number' || agent.avg_first_response_minutes === null,
                'Should have avg first response time');
            assert.ok(typeof agent.avg_resolution_minutes === 'number' || agent.avg_resolution_minutes === null,
                'Should have avg resolution time');
            assert.ok(typeof agent.sla_compliance_rate === 'number' || agent.sla_compliance_rate === null,
                'Should have SLA compliance rate');
            assert.ok(typeof agent.current_ticket_count === 'number', 'Should have current ticket count');
            assert.ok(typeof agent.workload_percentage === 'number', 'Should have workload percentage');

            console.log(`✅ Agent performance metrics returned (${data.agents.length} agents)`);
        } else {
            console.log('✅ Agent performance endpoint works (no agents with tickets yet)');
        }
    });

    it('should support sorting and filtering', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        // Test sorting by different fields
        const sortFields = ['tickets_resolved', 'avg_resolution_minutes', 'sla_compliance_rate'];

        for (const sortBy of sortFields) {
            const { response, data } = await apiCall(
                `/support/analytics/agents?period=30&sortBy=${sortBy}&sortOrder=DESC`,
                adminToken
            );

            assert.strictEqual(response.ok, true, `Should return success for sortBy=${sortBy}`);
            assert.ok(Array.isArray(data.agents), 'Should return agents array');
        }

        console.log('✅ Agent analytics supports sorting and filtering');
    });

    it('should support different time periods', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const periods = [7, 30, 90];

        for (const period of periods) {
            const { response, data } = await apiCall(
                `/support/analytics/agents?period=${period}`,
                adminToken
            );

            assert.strictEqual(response.ok, true, `Should work for period=${period}`);
            assert.strictEqual(data.period_days, period, 'Should return correct period');
        }

        console.log('✅ Agent analytics supports different time periods');
    });
});

// ==================== TICKET TRENDS ANALYTICS ====================

describe('Ticket Trends Analytics', () => {
    it('should require admin authentication', async () => {
        const { response } = await apiCall('/support/analytics/trends', userToken);

        assert.strictEqual(response.status === 401 || response.status === 403, true,
            'Should deny access to non-admin users');

        console.log('✅ Ticket trends requires admin authentication');
    });

    it('should return ticket trends over time', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const { response, data } = await apiCall('/support/analytics/trends?period=30&groupBy=day', adminToken);

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.strictEqual(data.success, true, 'Response should indicate success');
        assert.ok(Array.isArray(data.trends), 'Should return trends array');
        assert.strictEqual(data.period_days, 30, 'Should return correct period');
        assert.strictEqual(data.group_by, 'day', 'Should return correct grouping');

        if (data.trends.length > 0) {
            const trend = data.trends[0];

            // Verify trend fields
            assert.ok(trend.period, 'Trend should have period');
            assert.ok(typeof trend.new_tickets === 'number', 'Should have new tickets count');
            assert.ok(typeof trend.resolved_tickets === 'number', 'Should have resolved tickets count');
            assert.ok(typeof trend.open_tickets === 'number', 'Should have open tickets count');

            console.log(`✅ Ticket trends returned (${data.trends.length} data points)`);
        } else {
            console.log('✅ Ticket trends endpoint works (no data yet)');
        }
    });

    it('should support different grouping options', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const groupings = ['day', 'week', 'month'];

        for (const groupBy of groupings) {
            const { response, data } = await apiCall(
                `/support/analytics/trends?period=30&groupBy=${groupBy}`,
                adminToken
            );

            assert.strictEqual(response.ok, true, `Should work for groupBy=${groupBy}`);
            assert.strictEqual(data.group_by, groupBy, 'Should return correct grouping');
        }

        console.log('✅ Ticket trends supports day/week/month grouping');
    });
});

// ==================== CATEGORY ANALYTICS ====================

describe('Category Analytics', () => {
    it('should require admin authentication', async () => {
        const { response } = await apiCall('/support/analytics/categories', userToken);

        assert.strictEqual(response.status === 401 || response.status === 403, true,
            'Should deny access to non-admin users');

        console.log('✅ Category analytics requires admin authentication');
    });

    it('should return category distribution and performance', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const { response, data } = await apiCall('/support/analytics/categories?period=30', adminToken);

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.strictEqual(data.success, true, 'Response should indicate success');
        assert.ok(Array.isArray(data.categories), 'Should return categories array');
        assert.strictEqual(data.period_days, 30, 'Should return correct period');

        if (data.categories.length > 0) {
            const category = data.categories[0];

            // Verify category fields
            assert.ok(category.category, 'Category should have name');
            assert.ok(typeof category.total_tickets === 'number', 'Should have total tickets');
            assert.ok(typeof category.resolved_tickets === 'number', 'Should have resolved tickets');
            assert.ok(typeof category.resolution_rate === 'number', 'Should have resolution rate');

            console.log(`✅ Category analytics returned (${data.categories.length} categories)`);
        } else {
            console.log('✅ Category analytics endpoint works (no categories yet)');
        }
    });
});

// ==================== CSAT ANALYTICS ====================

describe('CSAT Analytics', () => {
    it('should require admin authentication', async () => {
        const { response } = await apiCall('/support/analytics/csat', userToken);

        assert.strictEqual(response.status === 401 || response.status === 403, true,
            'Should deny access to non-admin users');

        console.log('✅ CSAT analytics requires admin authentication');
    });

    it('should return customer satisfaction analytics', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const { response, data } = await apiCall('/support/analytics/csat?period=30', adminToken);

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.strictEqual(data.success, true, 'Response should indicate success');
        assert.strictEqual(data.period_days, 30, 'Should return correct period');

        // Verify CSAT structure
        assert.ok(data.overall, 'Should have overall CSAT data');
        assert.ok(Array.isArray(data.distribution), 'Should have rating distribution');
        assert.ok(Array.isArray(data.trend), 'Should have CSAT trend');
        assert.ok(Array.isArray(data.by_category), 'Should have CSAT by category');
        assert.ok(Array.isArray(data.by_agent), 'Should have CSAT by agent');

        if (data.overall.total_ratings > 0) {
            // Verify overall CSAT fields
            assert.ok(typeof data.overall.rating === 'number', 'Should have average rating');
            assert.ok(typeof data.overall.total_ratings === 'number', 'Should have total ratings count');
            assert.ok(typeof data.overall.positive_ratings === 'number', 'Should have positive ratings count');
            assert.ok(typeof data.overall.positive_percentage === 'number', 'Should have positive percentage');

            console.log(`✅ CSAT analytics returned (avg rating: ${data.overall.rating})`);
        } else {
            console.log('✅ CSAT analytics endpoint works (no ratings yet)');
        }
    });
});

// ==================== DASHBOARD DATA ====================

describe('Dashboard Data', () => {
    it('should require admin authentication', async () => {
        const { response } = await apiCall('/support/analytics/dashboard', userToken);

        assert.strictEqual(response.status === 401 || response.status === 403, true,
            'Should deny access to non-admin users');

        console.log('✅ Dashboard data requires admin authentication');
    });

    it('should return comprehensive dashboard data', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const { response, data } = await apiCall('/support/analytics/dashboard?period=7', adminToken);

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.strictEqual(data.success, true, 'Response should indicate success');
        assert.ok(data.dashboard, 'Should have dashboard object');

        // Verify dashboard contains all sections
        assert.ok(Array.isArray(data.dashboard.agents), 'Should have agents data');
        assert.ok(Array.isArray(data.dashboard.trends), 'Should have trends data');
        assert.ok(Array.isArray(data.dashboard.categories), 'Should have categories data');
        assert.ok(data.dashboard.csat, 'Should have CSAT data');

        console.log('✅ Dashboard data aggregates all analytics sections');
    });

    it('should limit agent results to top 10', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const { response, data } = await apiCall('/support/analytics/dashboard?period=30', adminToken);

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.ok(data.dashboard.agents.length <= 10, 'Should return max 10 agents');

        console.log(`✅ Dashboard limits to top 10 agents (returned ${data.dashboard.agents.length})`);
    });

    it('should support different time periods', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const periods = [7, 14, 30];

        for (const period of periods) {
            const { response, data } = await apiCall(
                `/support/analytics/dashboard?period=${period}`,
                adminToken
            );

            assert.strictEqual(response.ok, true, `Should work for period=${period}`);
        }

        console.log('✅ Dashboard supports different time periods');
    });
});

// ==================== PERFORMANCE TESTS ====================

describe('Analytics Performance', () => {
    it('should respond quickly to analytics requests', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        const startTime = Date.now();
        const { response } = await apiCall('/support/analytics/dashboard?period=30', adminToken);
        const duration = Date.now() - startTime;

        assert.strictEqual(response.ok, true, 'Should return success');
        assert.ok(duration < 5000, 'Should respond within 5 seconds');

        console.log(`✅ Dashboard analytics completed in ${duration}ms`);
    });

    it('should handle concurrent analytics requests', async () => {
        if (!adminToken) {
            console.log('⚠️ Skipping - no admin token');
            return;
        }

        // Make 5 concurrent requests
        const requests = [
            apiCall('/support/analytics/agents?period=30', adminToken),
            apiCall('/support/analytics/trends?period=30', adminToken),
            apiCall('/support/analytics/categories?period=30', adminToken),
            apiCall('/support/analytics/csat?period=30', adminToken),
            apiCall('/support/analytics/dashboard?period=7', adminToken)
        ];

        const results = await Promise.all(requests);

        // All should succeed
        for (const { response, data } of results) {
            assert.strictEqual(response.ok, true, 'All concurrent requests should succeed');
            assert.strictEqual(data.success, true, 'All should return success');
        }

        console.log('✅ Handles 5 concurrent analytics requests successfully');
    });
});

// ==================== CLEANUP ====================

after(() => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Phase 4 Analytics Tests Complete\n');
});
