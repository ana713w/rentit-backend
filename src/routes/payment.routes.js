import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { captureDepositSchema } from '../schemas/payment.schema.js';
import {
    startOnboarding,
    getOnboardingStatus,
    captureDepositAmount,
    releaseDeposit,
} from '../controllers/payment.controller.js';

const router = Router();

router.use(isAuthenticated);

router.post('/onboarding', startOnboarding);
router.get('/onboarding/status', getOnboardingStatus);
router.post('/:id/capture-deposit', validate(captureDepositSchema), captureDepositAmount);
router.post('/:id/release-deposit', releaseDeposit);

export default router;
