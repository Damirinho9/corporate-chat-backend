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

// All file routes require authentication
router.use(authenticateToken);

// upload/download routes
router.post(
    '/upload',
    singleUploadMiddleware,
    validateUploadedFile,
    scanFile,
    fileController.uploadFile
);

router.get('/:id', fileController.getFile);
router.delete('/:id', fileController.deleteFile);

module.exports = router;