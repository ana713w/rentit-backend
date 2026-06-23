import express from "express";
import createError from "http-errors";
import authRoutes from "../routes/auth.routes.js";
import adminRoutes from "../routes/admin.routes.js";

const router = express.Router();

router.get('/', (req, res) => res.json({ health: 'ok' }));
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

export default router;

