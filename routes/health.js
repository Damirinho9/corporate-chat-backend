const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Cache for version info to avoid reading files on every request
let cachedVersion = null;
let cachedTimestamp = null;

function getVersionInfo() {
    if (cachedVersion && cachedTimestamp) {
        return { version: cachedVersion, timestamp: cachedTimestamp };
    }

    try {
        // Read package.json for version
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
        const version = packageJson.version;

        // Use index.html modification time as deployment timestamp
        const indexPath = path.join(__dirname, '../public/index.html');
        const stats = fs.statSync(indexPath);
        const timestamp = stats.mtime.getTime();

        // Cache the values
        cachedVersion = version;
        cachedTimestamp = timestamp;

        return { version, timestamp };
    } catch (error) {
        console.error('[Version] Error reading version info:', error);
        return { version: '1.0.0', timestamp: Date.now() };
    }
}

// GET /health - Health check endpoint (mounted at /api)
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// GET /version - Version check endpoint for auto-reload
router.get('/version', (req, res) => {
    const { version, timestamp } = getVersionInfo();
    res.status(200).json({
        version,
        timestamp,
        buildDate: new Date(timestamp).toISOString()
    });
});

module.exports = router;
