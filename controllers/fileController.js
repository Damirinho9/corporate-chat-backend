// ================================================
// ИНСТРУКЦИЯ: Скопировать в controllers/fileController.js
// ================================================

const path = require('path');
const fs = require('fs').promises;
const { query } = require('../config/database');
const { STORAGE_CONFIG, getFileCategory, sanitizeFilename } = require('../config/fileConfig');
const { processUploadedImage } = require('../utils/imageProcessor');

const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const file = req.file;
        const userId = req.user.id;
        const fileCategory = getFileCategory(file.mimetype, file.originalname);
        
        let filePath = null;
        let thumbnailPath = null;
        let width = null;
        let height = null;
        
        if (fileCategory === 'image') {
            const result = await processUploadedImage(file.path, file.filename);
            filePath = result.filePath;
            thumbnailPath = result.thumbnailPath;
            width = result.metadata?.width;
            height = result.metadata?.height;
        } else {
            const filesDir = path.join(STORAGE_CONFIG.uploadDir, STORAGE_CONFIG.filesDir);
            await fs.mkdir(filesDir, { recursive: true });
            const targetPath = path.join(filesDir, file.filename);
            await fs.rename(file.path, targetPath);
            filePath = path.relative(STORAGE_CONFIG.uploadDir, targetPath);
        }
        
        const result = await query(
            `INSERT INTO files (filename, original_filename, mime_type, size_bytes, 
                path, thumbnail_path, uploaded_by, file_type, width, height, scan_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [file.filename, sanitizeFilename(file.originalname), file.mimetype, file.size,
             filePath, thumbnailPath, userId, fileCategory, width, height, 'clean']
        );
        
        const fileRecord = result.rows[0];
        res.status(201).json({
            message: 'File uploaded successfully',
            file: {
                id: fileRecord.id,
                filename: fileRecord.original_filename,
                size: fileRecord.size_bytes,
                mimeType: fileRecord.mime_type,
                type: fileRecord.file_type,
                url: `/api/files/${fileRecord.id}`,
                thumbnailUrl: thumbnailPath ? `/api/files/${fileRecord.id}/thumbnail` : null,
                width: fileRecord.width,
                height: fileRecord.height,
                uploadedAt: fileRecord.created_at
            }
        });
    } catch (error) {
        console.error('File upload error:', error);
        if (req.file && req.file.path) {
            try { await fs.unlink(req.file.path); } catch (e) {}
        }
        res.status(500).json({ error: 'Failed to upload file' });
    }
};

const getFile = async (req, res) => {
    try {
        const fileId = req.params.id;

        const result = await query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const fileRecord = result.rows[0];

        // Check access only if user is authenticated
        if (req.user) {
            const userId = req.user.id;
            if (req.user.role !== 'admin' && fileRecord.uploaded_by !== userId) {
                if (fileRecord.message_id) {
                    const chatAccess = await query(
                        `SELECT 1 FROM messages m JOIN chat_participants cp ON m.chat_id = cp.chat_id
                         WHERE m.id = $1 AND cp.user_id = $2`,
                        [fileRecord.message_id, userId]
                    );
                    if (chatAccess.rows.length === 0) {
                        return res.status(403).json({ error: 'Access denied' });
                    }
                }
            }
        }

        if (fileRecord.scan_status === 'infected') {
            return res.status(403).json({ error: 'File is infected' });
        }

        const filePath = path.join(STORAGE_CONFIG.uploadDir, fileRecord.path);
        try {
            await fs.access(filePath);
        } catch (error) {
            console.error('File not found on disk:', filePath, error);
            return res.status(404).json({ error: 'File not found on disk' });
        }

        res.setHeader('Content-Type', fileRecord.mime_type);
        res.setHeader('Content-Disposition', `inline; filename="${fileRecord.original_filename}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({ error: 'Failed to get file' });
    }
};

const getFileThumbnail = async (req, res) => {
    try {
        const fileId = req.params.id;
        const result = await query('SELECT * FROM files WHERE id = $1', [fileId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const fileRecord = result.rows[0];
        if (!fileRecord.thumbnail_path) {
            return res.status(404).json({ error: 'Thumbnail not available' });
        }
        
        const thumbnailPath = path.join(STORAGE_CONFIG.uploadDir, fileRecord.thumbnail_path);
        try {
            await fs.access(thumbnailPath);
        } catch (error) {
            return res.status(404).json({ error: 'Thumbnail not found' });
        }
        
        res.setHeader('Content-Type', fileRecord.mime_type);
        res.sendFile(thumbnailPath);
    } catch (error) {
        console.error('Get thumbnail error:', error);
        res.status(500).json({ error: 'Failed to get thumbnail' });
    }
};

const deleteFile = async (req, res) => {
    try {
        const fileId = req.params.id;
        const userId = req.user.id;
        
        const result = await query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const fileRecord = result.rows[0];
        if (fileRecord.uploaded_by !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const filePath = path.join(STORAGE_CONFIG.uploadDir, fileRecord.path);
        try { await fs.unlink(filePath); } catch (error) {}
        
        if (fileRecord.thumbnail_path) {
            const thumbnailPath = path.join(STORAGE_CONFIG.uploadDir, fileRecord.thumbnail_path);
            try { await fs.unlink(thumbnailPath); } catch (error) {}
        }
        
        await query('DELETE FROM files WHERE id = $1', [fileId]);
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
};

const getUserFiles = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 50, offset = 0, type } = req.query;
        
        let queryText = `SELECT id, filename, original_filename, mime_type, size_bytes,
                         file_type, width, height, created_at FROM files WHERE uploaded_by = $1`;
        const params = [userId];
        
        if (type) {
            queryText += ` AND file_type = $2`;
            params.push(type);
        }
        
        queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        const result = await query(queryText, params);
        const files = result.rows.map(file => ({
            id: file.id,
            filename: file.original_filename,
            size: file.size_bytes,
            mimeType: file.mime_type,
            type: file.file_type,
            url: `/api/files/${file.id}`,
            thumbnailUrl: file.file_type === 'image' ? `/api/files/${file.id}/thumbnail` : null,
            width: file.width,
            height: file.height,
            uploadedAt: file.created_at
        }));
        
        res.json({ files });
    } catch (error) {
        console.error('Get user files error:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
};


// Upload file to message
const uploadFileToMessage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const file = req.file;
        const userId = req.user.id;
        const { chatId } = req.params;
        const { content } = req.body;
        const fileCategory = getFileCategory(file.mimetype, file.originalname);
        
        let filePath = null;
        let thumbnailPath = null;
        let width = null;
        let height = null;
        
        if (fileCategory === 'image') {
            const result = await processUploadedImage(file.path, file.filename);
            filePath = result.filePath;
            thumbnailPath = result.thumbnailPath;
            width = result.metadata?.width;
            height = result.metadata?.height;
        } else {
            const filesDir = path.join(STORAGE_CONFIG.uploadDir, STORAGE_CONFIG.filesDir);
            await fs.mkdir(filesDir, { recursive: true });
            const targetPath = path.join(filesDir, file.filename);
            await fs.rename(file.path, targetPath);
            filePath = path.relative(STORAGE_CONFIG.uploadDir, targetPath);
        }
        
        const fileResult = await query(
            `INSERT INTO files (filename, original_filename, mime_type, size_bytes, 
                path, thumbnail_path, uploaded_by, file_type, width, height, scan_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [file.filename, sanitizeFilename(file.originalname), file.mimetype, file.size,
             filePath, thumbnailPath, userId, fileCategory, width, height, 'clean']
        );
        
        const fileRecord = fileResult.rows[0];
        
        // Create message with file
        const messageResult = await query(
            `INSERT INTO messages (chat_id, user_id, content, file_id)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [chatId, userId, content || null, fileRecord.id]
        );
        
        // Update file with message_id
        await query(
            'UPDATE files SET message_id = $1 WHERE id = $2',
            [messageResult.rows[0].id, fileRecord.id]
        );
        
        res.status(201).json({
            message: 'File uploaded successfully',
            message: messageResult.rows[0],
            file: {
                id: fileRecord.id,
                filename: fileRecord.original_filename,
                url: `/api/files/${fileRecord.id}`,
                thumbnailUrl: thumbnailPath ? `/api/files/${fileRecord.id}/thumbnail` : null
            }
        });
    } catch (error) {
        console.error('Upload file to message error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
};

// Upload multiple files
const uploadMultipleFiles = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        const { chatId } = req.params;
        const userId = req.user.id;
        const uploadedFiles = [];
        
        for (const file of req.files) {
            const fileCategory = getFileCategory(file.mimetype, file.originalname);
            let filePath = null;
            let thumbnailPath = null;
            
            if (fileCategory === 'image') {
                const result = await processUploadedImage(file.path, file.filename);
                filePath = result.filePath;
                thumbnailPath = result.thumbnailPath;
            } else {
                const filesDir = path.join(STORAGE_CONFIG.uploadDir, STORAGE_CONFIG.filesDir);
                await fs.mkdir(filesDir, { recursive: true });
                const targetPath = path.join(filesDir, file.filename);
                await fs.rename(file.path, targetPath);
                filePath = path.relative(STORAGE_CONFIG.uploadDir, targetPath);
            }
            
            const fileResult = await query(
                `INSERT INTO files (filename, original_filename, mime_type, size_bytes, 
                    path, thumbnail_path, uploaded_by, file_type, scan_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [file.filename, sanitizeFilename(file.originalname), file.mimetype, file.size,
                 filePath, thumbnailPath, userId, fileCategory, 'clean']
            );
            
            uploadedFiles.push(fileResult.rows[0]);
        }
        
        res.status(201).json({
            message: 'Files uploaded successfully',
            files: uploadedFiles.map(f => ({
                id: f.id,
                filename: f.original_filename,
                url: `/api/files/${f.id}`
            }))
        });
    } catch (error) {
        console.error('Upload multiple files error:', error);
        res.status(500).json({ error: 'Failed to upload files' });
    }
};

// Delete file from message
const deleteFileFromMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;
        
        const result = await query(
            'SELECT file_id, user_id FROM messages WHERE id = $1',
            [messageId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const message = result.rows[0];
        
        if (message.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!message.file_id) {
            return res.status(400).json({ error: 'Message has no file' });
        }
        
        // Get file info
        const fileResult = await query('SELECT * FROM files WHERE id = $1', [message.file_id]);
        const fileRecord = fileResult.rows[0];
        
        // Delete file from disk
        const filePath = path.join(STORAGE_CONFIG.uploadDir, fileRecord.path);
        try { await fs.unlink(filePath); } catch (error) {}
        
        if (fileRecord.thumbnail_path) {
            const thumbnailPath = path.join(STORAGE_CONFIG.uploadDir, fileRecord.thumbnail_path);
            try { await fs.unlink(thumbnailPath); } catch (error) {}
        }
        
        // Delete file record
        await query('DELETE FROM files WHERE id = $1', [message.file_id]);
        
        // Update message
        await query('UPDATE messages SET file_id = NULL WHERE id = $1', [messageId]);
        
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete file from message error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
};

// Get file statistics (admin only)
const getFileStats = async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                COUNT(*) as total_files,
                COUNT(*) FILTER (WHERE file_type = 'image') as images,
                COUNT(*) FILTER (WHERE file_type = 'document') as documents,
                COUNT(*) FILTER (WHERE file_type = 'video') as videos,
                COUNT(*) FILTER (WHERE file_type = 'audio') as audio,
                SUM(size_bytes)::bigint as total_size,
                AVG(size_bytes)::bigint as avg_size
            FROM files
        `);

        const topUploaders = await query(`
            SELECT 
                u.id,
                u.name,
                u.username,
                COUNT(f.id) as file_count,
                SUM(f.size_bytes)::bigint as total_size
            FROM users u
            JOIN files f ON u.id = f.uploaded_by
            GROUP BY u.id, u.name, u.username
            ORDER BY file_count DESC
            LIMIT 10
        `);

        res.json({
            overall: stats.rows[0],
            topUploaders: topUploaders.rows
        });
    } catch (error) {
        console.error('Get file stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get file statistics',
            code: 'GET_FILE_STATS_ERROR'
        });
    }
};

module.exports = {
    uploadFile,
    getFile,
    getFileThumbnail,
    deleteFile,
    getUserFiles,
    uploadFileToMessage,
    uploadMultipleFiles,
    deleteFileFromMessage,
    getFileStats
};