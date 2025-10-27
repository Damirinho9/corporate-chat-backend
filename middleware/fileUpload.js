// ================================================
// middleware/fileUpload.js
// ================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const {
    FILE_LIMITS,
    STORAGE_CONFIG,
    SECURITY_CONFIG,
    isFileTypeAllowed,
    sanitizeFilename,
    generateUniqueFilename
} = require('../config/fileConfig');

// ==================== STORAGE CONFIG ====================
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const tempDir = path.join(STORAGE_CONFIG.uploadDir, STORAGE_CONFIG.tempDir);
        try {
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const sanitized = sanitizeFilename(file.originalname);
        const unique = generateUniqueFilename(sanitized);
        cb(null, unique);
    }
});

// ==================== FILTER ====================
const fileFilter = (req, file, cb) => {
    if (!isFileTypeAllowed(file.mimetype, file.originalname)) {
        return cb(new Error('File type not allowed'), false);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (SECURITY_CONFIG.blockedExtensions.includes(ext)) {
        return cb(new Error('File extension is blocked'), false);
    }
    cb(null, true);
};

// ==================== UPLOAD INIT ====================
const upload = multer({
    storage: storage,
    limits: {
        fileSize: FILE_LIMITS.MAX_FILE_SIZE,
        files: FILE_LIMITS.MAX_FILES_PER_MESSAGE
    },
    fileFilter: fileFilter
});

const uploadSingle = upload.single('file');
const uploadMultiple = upload.array('files', FILE_LIMITS.MAX_FILES_PER_MESSAGE);

// ==================== ERROR HANDLER ====================
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({
                    error: 'File too large',
                    maxSize: FILE_LIMITS.MAX_FILE_SIZE
                });
            case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                    error: 'Too many files',
                    maxFiles: FILE_LIMITS.MAX_FILES_PER_MESSAGE
                });
            default:
                return res.status(400).json({ error: 'File upload error' });
        }
    } else if (err) {
        return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
};

// ==================== VALIDATION ====================
const validateUploadedFile = async (req, res, next) => {
    if (!req.file && !req.files) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    try {
        const files = req.files || [req.file];
        for (const file of files) {
            await fs.access(file.path);
            const stats = await fs.stat(file.path);
            if (stats.size === 0) {
                await fs.unlink(file.path);
                return res.status(400).json({ error: 'Empty file not allowed' });
            }
        }
        next();
    } catch (error) {
        console.error('File validation error:', error);
        res.status(500).json({ error: 'File validation failed' });
    }
};

// ==================== SCAN ====================
const scanFile = async (req, res, next) => {
    const files = req.files || [req.file];
    try {
        for (const file of files) {
            const fd = await fs.open(file.path, 'r');
            const buffer = Buffer.alloc(1024);
            await fd.read(buffer, 0, 1024, 0);
            await fd.close();
            
            const magicNumbers = {
                exe: Buffer.from([0x4D, 0x5A]),
                elf: Buffer.from([0x7F, 0x45, 0x4C, 0x46]),
            };
            
            for (const [type, signature] of Object.entries(magicNumbers)) {
                if (buffer.slice(0, signature.length).equals(signature)) {
                    await fs.unlink(file.path);
                    return res.status(400).json({ error: 'Suspicious file detected' });
                }
            }
        }
        next();
    } catch (error) {
        console.error('File scan error:', error);
        next();
    }
};

// ==================== EXPORTS ====================
module.exports = {
    uploadSingle,
    uploadMultiple,
    handleUploadError,
    validateUploadedFile,
    validateFile: validateUploadedFile, // ✅ алиас под старое имя
    scanFile
};