import multer from 'multer';
import createError from 'http-errors';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
        return cb(createError(400, 'Only image files are allowed'));
    }
    cb(null, true);
}

export const uploadImages = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 10 },
}).array('images', 10);
