import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { uploadImages } from '../middlewares/upload.middleware.js';
import {
    listItemImages,
    uploadItemImages,
    setPrimaryItemImage,
    deleteItemImage,
} from '../controllers/itemImage.controller.js';

const router = Router({ mergeParams: true });

router.get('/', listItemImages);
router.post('/', isAuthenticated, uploadImages, uploadItemImages);
router.patch('/:imageId/primary', isAuthenticated, setPrimaryItemImage);
router.delete('/:imageId', isAuthenticated, deleteItemImage);

export default router;
