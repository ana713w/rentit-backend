import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated, isAdmin } from '../middlewares/auth.middleware.js';
import { resolveDisputeSchema } from '../schemas/dispute.schema.js';
import {
    listAllDisputes,
    getDispute,
    startReview,
    resolveDispute,
} from '../controllers/dispute.controller.js';

const router = Router();

router.use(isAuthenticated);

router.get('/', isAdmin, listAllDisputes);
router.get('/:id', getDispute);
router.patch('/:id/start-review', isAdmin, startReview);
router.patch('/:id/resolve', isAdmin, validate(resolveDisputeSchema), resolveDispute);

export default router;
