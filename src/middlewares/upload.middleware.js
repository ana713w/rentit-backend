import multer from 'multer';
import createError from 'http-errors';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
        return cb(createError(400, 'Only image files are allowed'));
    }
    cb(null, true);
}

const MAX_FILE_SIZE_MB = 5;

const multerImages = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 10 },
}).array('images', 10);

function toHttpError(err) {
    if (!(err instanceof multer.MulterError)) return err;
    if (err.code === 'LIMIT_FILE_SIZE') {
        return createError(413, `Each image must be ${MAX_FILE_SIZE_MB} MB or smaller`);
    }
    return createError(400, err.message);
}

export function uploadImages(req, res, next) {
    multerImages(req, res, (err) => {
        if (!err) return next();
        const httpError = toHttpError(err);
        if (req.complete) return next(httpError);
        req.on('end', () => next(httpError));
        req.resume();
    });
}
