const express = require('express');
const router = express.Router();

// GET /health - Health check endpoint (mounted at /api)
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

module.exports = router;
