import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { registerSchema, loginSchema, updateMeSchema } from '../schemas/auth.schema.js';
import { register, getMe, updateMe } from '../controllers/user.controller.js';
import { login, logout } from '../controllers/session.controller.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/logout', isAuthenticated, logout);
router.get('/me', isAuthenticated, getMe);
router.patch('/me', isAuthenticated, validate(updateMeSchema), updateMe);

export default router;
