import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { createReservationSchema } from '../schemas/reservation.schema.js';
import { createContractSchema } from '../schemas/contract.schema.js';
import { createVerificationSchema } from '../schemas/verification.schema.js';
import {
    createReservation,
    listMyReservations,
    listOwnerReservations,
    getReservation,
    acceptReservation,
    rejectReservation,
    cancelReservation,
} from '../controllers/reservation.controller.js';
import { createContract, listReservationContracts } from '../controllers/contract.controller.js';
import { createVerification, listReservationVerifications } from '../controllers/verification.controller.js';

const router = Router();

router.use(isAuthenticated);

router.post('/', validate(createReservationSchema), createReservation);
router.get('/mine', listMyReservations);
router.get('/owner', listOwnerReservations);
router.get('/:id', getReservation);
router.patch('/:id/accept', acceptReservation);
router.patch('/:id/reject', rejectReservation);
router.patch('/:id/cancel', cancelReservation);
router.post('/:id/contracts', validate(createContractSchema), createContract);
router.get('/:id/contracts', listReservationContracts);
router.post('/:id/verifications', validate(createVerificationSchema), createVerification);
router.get('/:id/verifications', listReservationVerifications);

export default router;
