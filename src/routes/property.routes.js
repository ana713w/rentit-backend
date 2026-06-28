import { Router } from 'express';
import { validate } from '../middlewares/validate.middlewares.js';
import { isAuthenticated } from '../middlewares/auth.middleware.js';
import { createPropertySchema, updatePropertySchema } from '../schemas/property.schema.js';
import {
    createProperty,
    listProperties,
    getProperty,
    updateProperty,
    deactivateProperty,
} from '../controllers/property.controller.js';
import propertyImageRoutes from './propertyImage.routes.js';
import blockedDateRoutes from './blockedDate.routes.js';

const router = Router();

router.get('/', listProperties);
router.get('/:id', getProperty);
router.post('/', isAuthenticated, validate(createPropertySchema), createProperty);
router.patch('/:id', isAuthenticated, validate(updatePropertySchema), updateProperty);
router.delete('/:id', isAuthenticated, deactivateProperty);
router.use('/:id/images', propertyImageRoutes);
router.use('/:id/blocked-dates', blockedDateRoutes);

export default router;