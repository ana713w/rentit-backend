import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { uploadImages } from '../middlewares/upload.middleware.js';
import {
    listPropertyImages,
    uploadPropertyImages,
    setPrimaryPropertyImage,
    deletePropertyImage,
} from '../controllers/propertyImage.controller.js';

const router = Router({ mergeParams: true });

router.get('/', listPropertyImages);
router.post('/', isAuthenticated, uploadImages, uploadPropertyImages);
router.patch('/:imageId/primary', isAuthenticated, setPrimaryPropertyImage);
router.delete('/:imageId', isAuthenticated, deletePropertyImage);

export default router;
