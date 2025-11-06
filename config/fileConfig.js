// ================================================
// ИНСТРУКЦИЯ: Скопировать в config/fileConfig.js
// ================================================

const path = require('path');

const FILE_LIMITS = {
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    MAX_FILES_PER_MESSAGE: 5,
    MAX_IMAGE_SIZE: 5 * 1024 * 1024,
    MAX_DOCUMENT_SIZE: 20 * 1024 * 1024,
};

const ALLOWED_FILE_TYPES = {
    image: {
        mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    },
    document: {
        mimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/csv'
        ],
        extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv']
    },
    video: {
        mimeTypes: ['video/mp4', 'video/mpeg', 'video/webm'],
        extensions: ['.mp4', '.mpeg', '.webm']
    },
    audio: {
        mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'],
        extensions: ['.mp3', '.wav', '.webm', '.ogg']
    },
    archive: {
        mimeTypes: [
            'application/zip',
            'application/x-zip-compressed',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/x-tar',
            'application/gzip',
            'application/x-bzip2'
        ],
        extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2']
    },
    other: {
        mimeTypes: ['application/octet-stream', 'binary/octet-stream'],
        extensions: ['.bin']
    }
};

const STORAGE_CONFIG = {
    uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'),
    tempDir: 'temp',
    filesDir: 'files',
    thumbnailsDir: 'thumbnails',
};

const IMAGE_CONFIG = {
    thumbnail: { width: 300, height: 300, fit: 'inside', quality: 80 },
    preview: { maxWidth: 1920, maxHeight: 1080, quality: 85 }
};

const SECURITY_CONFIG = {
    blockedExtensions: ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar'],
    maxFilenameLength: 255,
    sanitizeFilenames: true
};

function getFileCategory(mimeType, filename) {
    const ext = path.extname(filename).toLowerCase();
    for (const [category, config] of Object.entries(ALLOWED_FILE_TYPES)) {
        if (config.mimeTypes.includes(mimeType) || config.extensions.includes(ext)) {
            return category;
        }
    }
    return 'other';
}

function isFileTypeAllowed(mimeType, filename) {
    const ext = path.extname(filename).toLowerCase();
    if (SECURITY_CONFIG.blockedExtensions.includes(ext)) return false;
    for (const config of Object.values(ALLOWED_FILE_TYPES)) {
        if (config.mimeTypes.includes(mimeType) || config.extensions.includes(ext)) {
            return true;
        }
    }
    return false;
}

function sanitizeFilename(filename) {
    if (!SECURITY_CONFIG.sanitizeFilenames) return filename;
    filename = filename.replace(/[\/\\]/g, '_');
    filename = filename.replace(/[<>:"|?*\x00-\x1F]/g, '');
    if (filename.length > SECURITY_CONFIG.maxFilenameLength) {
        const ext = path.extname(filename);
        const name = path.basename(filename, ext);
        filename = name.substring(0, SECURITY_CONFIG.maxFilenameLength - ext.length) + ext;
    }
    return filename;
}

function generateUniqueFilename(originalFilename) {
    const ext = path.extname(originalFilename);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}${ext}`;
}

module.exports = {
    FILE_LIMITS,
    ALLOWED_FILE_TYPES,
    STORAGE_CONFIG,
    IMAGE_CONFIG,
    SECURITY_CONFIG,
    getFileCategory,
    isFileTypeAllowed,
    sanitizeFilename,
    generateUniqueFilename
};
