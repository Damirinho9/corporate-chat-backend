const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { authenticateToken, authenticateTokenAllowQuery } = require('../middleware/auth');
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

// upload/download routes
router.post(
    '/upload',
    authenticateToken,
    singleUploadMiddleware,
    validateUploadedFile,
    scanFile,
    fileController.uploadFile
);

router.get('/:id/thumbnail', authenticateTokenAllowQuery, fileController.getFileThumbnail);
router.get('/:id', authenticateTokenAllowQuery, fileController.getFile);
router.delete('/:id', authenticateToken, fileController.deleteFile);

module.exports = router;