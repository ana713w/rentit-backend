import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { uploadImages } from '../middlewares/upload.middleware.js';
import { updateNotesSchema } from '../schemas/verification.schema.js';
import {
    getVerification,
    updateVerificationNotes,
    listVerificationPhotos,
    uploadVerificationPhotos,
    deleteVerificationPhoto,
} from '../controllers/verification.controller.js';

const router = Router();

router.use(isAuthenticated);

router.get('/:id', getVerification);
router.patch('/:id', validate(updateNotesSchema), updateVerificationNotes);
router.get('/:id/photos', listVerificationPhotos);
router.post('/:id/photos', uploadImages, uploadVerificationPhotos);
router.delete('/:id/photos/:photoId', deleteVerificationPhoto);

export default router;
