import { Router } from "express";
import { validate } from "../middlewares/validate.middlewares.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.middleware.js";
import { promoteSchema } from "../schemas/admin.schema.js";
import { promoteToAdmin } from "../controllers/admin.controller.js";

const router = Router();

router.use(isAuthenticated, isAdmin);
router.post("/promote", validate(promoteSchema), promoteToAdmin);

export default router;

