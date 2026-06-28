import express from "express";
import createError from "http-errors";
import authRoutes from "../routes/auth.routes.js";
import adminRoutes from "../routes/admin.routes.js";
import propertyRoutes from "../routes/property.routes.js";
import reservationRoutes from "../routes/reservation.routes.js";
import contractRoutes from "../routes/contract.routes.js";
import verificationRoutes from "../routes/verification.routes.js";

const router = express.Router();

router.get('/', (req, res) => res.json({ health: 'ok' }));
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/properties', propertyRoutes);
router.use('/reservations', reservationRoutes);
router.use('/contracts', contractRoutes);
router.use('/verifications', verificationRoutes);

export default router;

