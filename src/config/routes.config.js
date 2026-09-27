import express from "express";
import createError from "http-errors";
import authRoutes from "../routes/auth.routes.js";
import adminRoutes from "../routes/admin.routes.js";
import itemRoutes from "../routes/item.routes.js";
import reservationRoutes from "../routes/reservation.routes.js";
import contractRoutes from "../routes/contract.routes.js";
import verificationRoutes from "../routes/verification.routes.js";
import paymentRoutes from "../routes/payment.routes.js";
import disputeRoutes from "../routes/dispute.routes.js";

const router = express.Router();

router.get('/', (req, res) => res.json({ health: 'ok' }));
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/items', itemRoutes);
router.use('/reservations', reservationRoutes);
router.use('/contracts', contractRoutes);
router.use('/verifications', verificationRoutes);
router.use('/payments', paymentRoutes);
router.use('/disputes', disputeRoutes);

export default router;

