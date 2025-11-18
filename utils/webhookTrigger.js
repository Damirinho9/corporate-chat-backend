const crypto = require('crypto');
const { query } = require('../config/database');

/**
 * Generate HMAC signature for webhook payload
 * @param {string} secret - Webhook secret
 * @param {object} payload - Payload object
 * @returns {string} HMAC signature
 */
function generateSignature(secret, payload) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
}

/**
 * Trigger a webhook
 * @param {object} webhook - Webhook configuration
 * @param {object} payload - Event payload
 * @returns {Promise<object>} Result with success status and details
 */
async function triggerWebhook(webhook, payload) {
    const startTime = Date.now();
    let statusCode = null;
    let responseBody = null;
    let errorMessage = null;

    try {
        // Generate signature
        const signature = generateSignature(webhook.secret, payload);

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-ID': webhook.id.toString(),
            'X-Webhook-Event': payload.event,
            'User-Agent': 'CorporateChat-Webhook/1.0',
            ...(webhook.headers || {})
        };

        // Send HTTP request
        const fetch = require('node-fetch');

        const response = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            timeout: 10000 // 10 second timeout
        });

        statusCode = response.status;
        responseBody = await response.text();

        const duration = Date.now() - startTime;
        const success = response.ok;

        // Log webhook call
        await logWebhookCall(webhook.id, payload.event, payload, headers, statusCode, responseBody, null, duration);

        // Update webhook statistics
        await updateWebhookStats(webhook.id, success);

        return {
            success,
            statusCode,
            responseBody,
            duration
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        errorMessage = error.message;

        console.error('Webhook trigger error:', {
            webhook_id: webhook.id,
            url: webhook.url,
            error: errorMessage
        });

        // Log failed webhook call
        await logWebhookCall(webhook.id, payload.event, payload, null, statusCode, responseBody, errorMessage, duration);

        // Update webhook statistics
        await updateWebhookStats(webhook.id, false);

        return {
            success: false,
            statusCode: statusCode || 0,
            error: errorMessage,
            duration
        };
    }
}

/**
 * Log webhook execution
 */
async function logWebhookCall(webhookId, eventType, payload, requestHeaders, responseStatus, responseBody, errorMessage, duration) {
    try {
        await query(
            `INSERT INTO webhook_logs (webhook_id, event_type, payload, request_headers, response_status, response_body, error_message, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                webhookId,
                eventType,
                JSON.stringify(payload),
                requestHeaders ? JSON.stringify(requestHeaders) : null,
                responseStatus,
                responseBody ? responseBody.substring(0, 5000) : null, // Limit response body size
                errorMessage,
                duration
            ]
        );
    } catch (error) {
        console.error('Failed to log webhook call:', error);
    }
}

/**
 * Update webhook statistics
 */
async function updateWebhookStats(webhookId, success) {
    try {
        if (success) {
            await query(
                `UPDATE webhooks
                 SET total_calls = total_calls + 1,
                     last_triggered_at = CURRENT_TIMESTAMP,
                     last_status = 'success'
                 WHERE id = $1`,
                [webhookId]
            );
        } else {
            await query(
                `UPDATE webhooks
                 SET total_calls = total_calls + 1,
                     failed_calls = failed_calls + 1,
                     last_triggered_at = CURRENT_TIMESTAMP,
                     last_status = 'failed'
                 WHERE id = $1`,
                [webhookId]
            );
        }
    } catch (error) {
        console.error('Failed to update webhook stats:', error);
    }
}

/**
 * Trigger all webhooks for a specific event
 * @param {string} eventType - Event type (e.g., 'message.created')
 * @param {object} eventData - Event data
 */
async function triggerWebhooksForEvent(eventType, eventData) {
    try {
        // Get all active webhooks subscribed to this event
        const result = await query(
            `SELECT * FROM webhooks
             WHERE is_active = true AND $1 = ANY(events)`,
            [eventType]
        );

        const webhooks = result.rows;

        if (webhooks.length === 0) {
            return;
        }

        // Prepare payload
        const payload = {
            event: eventType,
            data: eventData,
            timestamp: new Date().toISOString()
        };

        // Trigger all webhooks in parallel (with error handling)
        const promises = webhooks.map(webhook =>
            triggerWebhook(webhook, payload).catch(error => {
                console.error(`Webhook ${webhook.id} trigger failed:`, error);
                return { success: false, error: error.message };
            })
        );

        await Promise.all(promises);

    } catch (error) {
        console.error('Failed to trigger webhooks for event:', eventType, error);
    }
}

/**
 * Retry failed webhook calls
 * @param {number} webhookId - Webhook ID
 * @param {number} logId - Webhook log ID to retry
 */
async function retryWebhook(webhookId, logId) {
    try {
        // Get webhook and original log
        const webhookResult = await query('SELECT * FROM webhooks WHERE id = $1', [webhookId]);
        const logResult = await query('SELECT * FROM webhook_logs WHERE id = $1', [logId]);

        if (webhookResult.rows.length === 0 || logResult.rows.length === 0) {
            throw new Error('Webhook or log not found');
        }

        const webhook = webhookResult.rows[0];
        const log = logResult.rows[0];

        // Retry with original payload
        const payload = {
            event: log.event_type,
            data: log.payload.data,
            timestamp: new Date().toISOString(),
            retry: true,
            original_attempt: log.created_at
        };

        return await triggerWebhook(webhook, payload);

    } catch (error) {
        console.error('Webhook retry error:', error);
        throw error;
    }
}

module.exports = {
    generateSignature,
    triggerWebhook,
    triggerWebhooksForEvent,
    retryWebhook
};
