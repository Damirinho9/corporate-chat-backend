const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { authenticateToken } = require('../middleware/auth');
const {
    uploadSingle,
    handleUploadError,
    validateUploadedFile,
    scanFile
} = require('../middleware/fileUpload');

// Helper to integrate multer error handler within route pipeline
function singleUploadMiddleware(req, res, next) {
    uploadSingle(req, res, (err) => {
        if (err) {
            return handleUploadError(err, req, res, next);
        }
        next();
    });
}

// Upload requires authentication
router.post(
    '/upload',
    authenticateToken,
    singleUploadMiddleware,
    validateUploadedFile,
    scanFile,
    fileController.uploadFile
);

// File viewing does not require authentication (files are already in chats user has access to)
router.get('/:id/thumbnail', fileController.getFileThumbnail);
router.get('/:id', fileController.getFile);

// Delete requires authentication
router.delete('/:id', authenticateToken, fileController.deleteFile);

module.exports = router;