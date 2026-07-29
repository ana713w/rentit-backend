import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { signContractSchema } from '../schemas/contract.schema.js';
import { getContract, requestOtp, signContract } from '../controllers/contract.controller.js';

const router = Router();

router.use(isAuthenticated);

router.get('/:id', getContract);
router.post('/:id/otp', requestOtp);
router.post('/:id/sign', validate(signContractSchema), signContract);

export default router;
