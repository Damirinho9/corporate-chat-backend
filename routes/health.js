const express = require('express');
const router = express.Router();

// GET /api/health - Health check endpoint
router.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
router.get('/', (req, res) => {
    res.status(200).json({
        name: 'Corporate Chat Backend API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
