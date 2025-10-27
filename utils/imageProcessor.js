// ================================================
// ИНСТРУКЦИЯ: Скопировать в utils/imageProcessor.js
// ================================================

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { IMAGE_CONFIG, STORAGE_CONFIG } = require('../config/fileConfig');

async function generateThumbnail(inputPath, outputPath) {
    try {
        const { width, height, fit, quality } = IMAGE_CONFIG.thumbnail;
        await sharp(inputPath)
            .resize(width, height, { fit: fit, withoutEnlargement: true })
            .jpeg({ quality })
            .toFile(outputPath);
        return true;
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        throw new Error('Failed to generate thumbnail');
    }
}

async function optimizeImage(inputPath, outputPath) {
    try {
        const { maxWidth, maxHeight, quality } = IMAGE_CONFIG.preview;
        const metadata = await sharp(inputPath).metadata();
        
        if (metadata.width > maxWidth || metadata.height > maxHeight) {
            await sharp(inputPath)
                .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: false })
                .jpeg({ quality })
                .toFile(outputPath);
        } else {
            await sharp(inputPath).jpeg({ quality }).toFile(outputPath);
        }
        return true;
    } catch (error) {
        console.error('Image optimization error:', error);
        throw new Error('Failed to optimize image');
    }
}

async function getImageMetadata(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: metadata.size,
            hasAlpha: metadata.hasAlpha,
            orientation: metadata.orientation
        };
    } catch (error) {
        console.error('Get image metadata error:', error);
        return null;
    }
}

async function processUploadedImage(inputPath, filename) {
    try {
        const baseDir = STORAGE_CONFIG.uploadDir;
        const filesDir = path.join(baseDir, STORAGE_CONFIG.filesDir);
        const thumbnailsDir = path.join(baseDir, STORAGE_CONFIG.thumbnailsDir);
        
        await fs.mkdir(filesDir, { recursive: true });
        await fs.mkdir(thumbnailsDir, { recursive: true });
        
        const ext = path.extname(filename);
        const nameWithoutExt = path.basename(filename, ext);
        
        const optimizedPath = path.join(filesDir, filename);
        const thumbnailFilename = `${nameWithoutExt}_thumb${ext}`;
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
        
        const metadata = await getImageMetadata(inputPath);
        await optimizeImage(inputPath, optimizedPath);
        await generateThumbnail(inputPath, thumbnailPath);
        await fs.unlink(inputPath);
        
        return {
            filePath: path.relative(baseDir, optimizedPath),
            thumbnailPath: path.relative(baseDir, thumbnailPath),
            metadata
        };
    } catch (error) {
        console.error('Image processing error:', error);
        throw new Error('Failed to process image');
    }
}

module.exports = {
    generateThumbnail,
    optimizeImage,
    getImageMetadata,
    processUploadedImage
};
