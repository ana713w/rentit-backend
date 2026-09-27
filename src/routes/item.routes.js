import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { createItemSchema, updateItemSchema } from '../schemas/item.schema.js';
import {
    createItem,
    listItems,
    getItem,
    updateItem,
    deactivateItem,
} from '../controllers/item.controller.js';
import itemImageRoutes from './itemImage.routes.js';
import blockedDateRoutes from './blockedDate.routes.js';

const router = Router();

router.get('/', listItems);
router.get('/:id', getItem);
router.post('/', isAuthenticated, validate(createItemSchema), createItem);
router.patch('/:id', isAuthenticated, validate(updateItemSchema), updateItem);
router.delete('/:id', isAuthenticated, deactivateItem);
router.use('/:id/images', itemImageRoutes);
router.use('/:id/blocked-dates', blockedDateRoutes);

export default router;