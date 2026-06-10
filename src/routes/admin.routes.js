import { Router } from "express";
import { validate } from "../middlewares/validate.middlewares.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.middleware.js";
import { promoteSchema } from "../schemas/admin.schemas.js";
import { promoteUserToAdmin } from "../controllers/admin.controller.js";

const router = Router();

router.use(isAuthenticated, isAdmin);
router.post("/promote", validate(promoteSchema), promoteUserToAdmin);

export default router;