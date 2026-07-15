import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { createBlockedDateSchema } from '../schemas/blockedDate.schema.js';
import {
    listBlockedDates,
    createBlockedDate,
    deleteBlockedDate,
} from '../controllers/blockedDate.controller.js';

const router = Router({ mergeParams: true });

router.get('/', listBlockedDates);
router.post('/', isAuthenticated, validate(createBlockedDateSchema), createBlockedDate);
router.delete('/:blockId', isAuthenticated, deleteBlockedDate);

export default router;
