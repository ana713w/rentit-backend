const cookieAuth = [{ cookieAuth: [] }];

const idParam = (name, description) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description,
});

const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

export const openapiSpec = {
    openapi: '3.0.3',
    info: {
        title: 'RentIt API',
        version: '1.0.0',
        description:
            'API de alquiler de objetos entre particulares: reservas con aprobacion del propietario, ' +
            'contratos firmados por OTP, verificaciones de check-in/check-out con fotos, pagos con Stripe Connect ' +
            '(alquiler + deposito de garantia) y disputas resueltas por un administrador.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [
        { name: 'Auth' },
        { name: 'Admin' },
        { name: 'Items' },
        { name: 'Item Images' },
        { name: 'Blocked Dates' },
        { name: 'Reservations' },
        { name: 'Contracts' },
        { name: 'Verifications' },
        { name: 'Payments' },
        { name: 'Disputes' },
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'connect.sid',
                description: 'Sesion iniciada via POST /auth/login (cookie httpOnly gestionada por express-session).',
            },
        },
        schemas: {
            Error: {
                type: 'object',
                properties: { error: { type: 'string' } },
            },
            ValidationError: {
                type: 'object',
                properties: {
                    error: { type: 'string', example: 'Validation error' },
                    details: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
                },
            },
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    email: { type: 'string', format: 'email' },
                    fullName: { type: 'string' },
                    phone: { type: 'string', nullable: true },
                    address: { type: 'string', nullable: true, description: "Where the user's items are picked up and returned" },
                    latitude: { type: 'number', nullable: true },
                    longitude: { type: 'number', nullable: true },
                },
            },
            Item: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    owner_id: { type: 'string', format: 'uuid' },
                    title: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    price_per_day: { type: 'number' },
                    deposit_amount: { type: 'number' },
                    category: { type: 'string' },
                    is_active: { type: 'boolean' },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                },
            },
            Reservation: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    item_id: { type: 'string', format: 'uuid' },
                    guest_id: { type: 'string', format: 'uuid' },
                    start_date: { type: 'string', format: 'date' },
                    end_date: { type: 'string', format: 'date' },
                    price_per_day: { type: 'number' },
                    deposit_amount: { type: 'number' },
                    status: {
                        type: 'string',
                        enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'completed'],
                    },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                },
            },
            Contract: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    reservation_id: { type: 'string', format: 'uuid' },
                    contract_type: { type: 'string', enum: ['rental', 'return'] },
                    document_url: { type: 'string', nullable: true },
                    guest_signed_at: { type: 'string', format: 'date-time', nullable: true },
                    owner_signed_at: { type: 'string', format: 'date-time', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            Verification: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    reservation_id: { type: 'string', format: 'uuid' },
                    verification_type: { type: 'string', enum: ['check_in', 'check_out'] },
                    notes: { type: 'string', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                },
            },
            VerificationPhoto: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    verification_id: { type: 'string', format: 'uuid' },
                    uploaded_by: { type: 'string', format: 'uuid' },
                    url: { type: 'string' },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            Payment: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    reservation_id: { type: 'string', format: 'uuid' },
                    rent_amount: { type: 'number' },
                    deposit_amount: { type: 'number' },
                    platform_fee_amount: { type: 'number' },
                    rent_status: { type: 'string', enum: ['pending', 'succeeded', 'failed', 'refunded'] },
                    deposit_status: {
                        type: 'string',
                        enum: ['pending', 'authorized', 'captured', 'released', 'canceled', 'failed'],
                    },
                    deposit_captured_amount: { type: 'number', nullable: true },
                },
            },
            Dispute: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    reservation_id: { type: 'string', format: 'uuid' },
                    raised_by: { type: 'string', format: 'uuid' },
                    reason: { type: 'string' },
                    requested_capture_amount: { type: 'number', nullable: true },
                    status: { type: 'string', enum: ['open', 'under_review', 'resolved'] },
                    resolution: { type: 'string', nullable: true },
                    resolved_by: { type: 'string', format: 'uuid', nullable: true },
                    resolved_at: { type: 'string', format: 'date-time', nullable: true },
                },
            },
        },
    },
    paths: {
        '/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Register a new user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'password', 'fullName', 'phone', 'address'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    password: { type: 'string', minLength: 8 },
                                    fullName: { type: 'string' },
                                    phone: { type: 'string' },
                                    address: { type: 'string' },
                                    latitude: { type: 'number' },
                                    longitude: { type: 'number' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
                    409: errorResponse('Email already registered'),
                },
            },
        },
        '/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Log in and start a session',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'password'],
                                properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Logged in', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    401: errorResponse('Invalid credentials'),
                },
            },
        },
        '/auth/logout': {
            post: {
                tags: ['Auth'],
                summary: 'Log out and destroy the session',
                security: cookieAuth,
                responses: { 204: { description: 'Logged out' }, 401: errorResponse('Not authenticated') },
            },
        },
        '/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Get the current authenticated user',
                security: cookieAuth,
                responses: {
                    200: { description: 'Current user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    401: errorResponse('Not authenticated'),
                },
            },
            patch: {
                tags: ['Auth'],
                summary: 'Update the current user profile (name, phone, address)',
                security: cookieAuth,
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fullName: { type: 'string' },
                                    phone: { type: 'string' },
                                    address: { type: 'string' },
                                    latitude: { type: 'number', nullable: true, description: 'null borra la ubicación guardada' },
                                    longitude: { type: 'number', nullable: true },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Profile updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
                    401: errorResponse('Not authenticated'),
                },
            },
        },
        '/admin/promote': {
            post: {
                tags: ['Admin'],
                summary: 'Promote a user to admin (admin only)',
                security: cookieAuth,
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } },
                },
                responses: { 201: { description: 'User promoted' }, 400: errorResponse('User is already an admin'), 403: errorResponse('Admin only'), 404: errorResponse('No user with that email') },
            },
        },
        '/items': {
            get: {
                tags: ['Items'],
                summary: 'List active items. With lat and lng, only items whose owner is within radiusKm, ordered by distance (distance_km)',
                parameters: [
                    { name: 'lat', in: 'query', schema: { type: 'number', minimum: -90, maximum: 90 }, description: 'Latitude of the search point (send together with lng)' },
                    { name: 'lng', in: 'query', schema: { type: 'number', minimum: -180, maximum: 180 }, description: 'Longitude of the search point (send together with lat)' },
                    { name: 'radiusKm', in: 'query', schema: { type: 'number', maximum: 100, default: 5 }, description: 'Search radius in kilometres' },
                ],
                responses: { 400: { description: 'Invalid coordinates or radius', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } }, 200: { description: 'List of items', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Item' } } } } } },
            },
            post: {
                tags: ['Items'],
                summary: 'Create an item (becomes its owner). Requires an address in the user profile, where the item is picked up',
                security: cookieAuth,
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['title', 'pricePerDay', 'depositAmount', 'category'],
                                properties: {
                                    title: { type: 'string' },
                                    description: { type: 'string' },
                                    pricePerDay: { type: 'number' },
                                    depositAmount: { type: 'number', description: 'Must be between 3x and 365x pricePerDay' },
                                    category: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'Item created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } },
                    400: { description: 'Validation error, or the owner has no address in their profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
                },
            },
        },
        '/items/{id}': {
            parameters: [idParam('id', 'Item id')],
            get: {
                tags: ['Items'],
                summary: 'Get an item by id',
                responses: { 200: { description: 'Item', content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } }, 404: errorResponse('Item not found') },
            },
            patch: {
                tags: ['Items'],
                summary: 'Update an item (owner only)',
                security: cookieAuth,
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string' },
                                    description: { type: 'string' },
                                    pricePerDay: { type: 'number' },
                                    depositAmount: { type: 'number' },
                                    category: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Item updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } },
                    400: errorResponse('Invalid deposit/price ratio'),
                    403: errorResponse('Not the owner'),
                },
            },
            delete: {
                tags: ['Items'],
                summary: 'Deactivate an item (owner only)',
                security: cookieAuth,
                responses: { 204: { description: 'Item deactivated' }, 403: errorResponse('Not the owner') },
            },
        },
        '/items/{id}/images': {
            parameters: [idParam('id', 'Item id')],
            get: { tags: ['Item Images'], summary: 'List an item\'s images', responses: { 200: { description: 'Images list' } } },
            post: {
                tags: ['Item Images'],
                summary: 'Upload one or more images (owner only)',
                security: cookieAuth,
                requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
                responses: { 201: { description: 'Images uploaded' }, 403: errorResponse('Not the owner') },
            },
        },
        '/items/{id}/images/{imageId}/primary': {
            parameters: [idParam('id', 'Item id'), idParam('imageId', 'Image id')],
            patch: { tags: ['Item Images'], summary: 'Mark an image as the primary one (owner only)', security: cookieAuth, responses: { 200: { description: 'Primary image set' } } },
        },
        '/items/{id}/images/{imageId}': {
            parameters: [idParam('id', 'Item id'), idParam('imageId', 'Image id')],
            delete: { tags: ['Item Images'], summary: 'Delete an image (owner only)', security: cookieAuth, responses: { 204: { description: 'Image deleted' } } },
        },
        '/items/{id}/blocked-dates': {
            parameters: [idParam('id', 'Item id')],
            get: { tags: ['Blocked Dates'], summary: "List an item's blocked date ranges", responses: { 200: { description: 'Blocked dates list' } } },
            post: {
                tags: ['Blocked Dates'],
                summary: 'Block a date range (owner only)',
                security: cookieAuth,
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { type: 'object', required: ['startDate', 'endDate'], properties: { startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, reason: { type: 'string' } } },
                        },
                    },
                },
                responses: { 201: { description: 'Date range blocked' }, 409: errorResponse('Overlaps an existing blocked range') },
            },
        },
        '/items/{id}/blocked-dates/{blockId}': {
            parameters: [idParam('id', 'Item id'), idParam('blockId', 'Blocked date id')],
            delete: { tags: ['Blocked Dates'], summary: 'Remove a blocked date range (owner only)', security: cookieAuth, responses: { 204: { description: 'Blocked range removed' } } },
        },
        '/reservations': {
            post: {
                tags: ['Reservations'],
                summary: 'Request a reservation for an item. startDate cannot be in the past and a rental lasts at most MAX_RENTAL_DAYS days (6 by default), because Stripe only holds the deposit for about 7 days',
                security: cookieAuth,
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['itemId', 'startDate', 'endDate'],
                                properties: { itemId: { type: 'string', format: 'uuid' }, startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' } },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'Reservation created (pending)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
                    400: { description: 'Validation error: past start date or rental longer than MAX_RENTAL_DAYS', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
                    409: errorResponse('Dates not available'),
                },
            },
        },
        '/reservations/mine': {
            get: { tags: ['Reservations'], summary: 'List reservations made by the current user (as guest)', security: cookieAuth, responses: { 200: { description: 'Reservations list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Reservation' } } } } } } },
        },
        '/reservations/owner': {
            get: { tags: ['Reservations'], summary: 'List reservations for items owned by the current user', security: cookieAuth, responses: { 200: { description: 'Reservations list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Reservation' } } } } } } },
        },
        '/reservations/{id}': {
            parameters: [idParam('id', 'Reservation id')],
            get: { tags: ['Reservations'], summary: 'Get a reservation (guest or owner only). When confirmed or completed it includes counterpart: the other party contact (fullName, email, phone, role) and, for the guest, the owner pickupAddress', security: cookieAuth, responses: { 200: { description: 'Reservation', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } }, 403: errorResponse('Not part of this reservation') } },
        },
        '/reservations/{id}/accept': {
            parameters: [idParam('id', 'Reservation id')],
            patch: { tags: ['Reservations'], summary: 'Accept a pending reservation (owner only) - confirms it and rejects overlapping pending ones', security: cookieAuth, responses: { 200: { description: 'Reservation confirmed' }, 409: errorResponse('Dates no longer available') } },
        },
        '/reservations/{id}/reject': {
            parameters: [idParam('id', 'Reservation id')],
            patch: { tags: ['Reservations'], summary: 'Reject a pending reservation (owner only)', security: cookieAuth, responses: { 200: { description: 'Reservation rejected' } } },
        },
        '/reservations/{id}/cancel': {
            parameters: [idParam('id', 'Reservation id')],
            patch: {
                tags: ['Reservations'],
                summary: 'Cancel a pending or confirmed reservation (guest or owner)',
                description: 'If the reservation was confirmed and already had a payment, the rent is refunded and the deposit authorization is canceled.',
                security: cookieAuth,
                responses: { 200: { description: 'Reservation cancelled' }, 409: errorResponse('Reservation cannot be cancelled') },
            },
        },
        '/reservations/{id}/contracts': {
            parameters: [idParam('id', 'Reservation id')],
            post: {
                tags: ['Contracts'],
                summary: 'Create a contract for the reservation. The rental contract is available from one day before pickup; the return act needs the rental contract signed and the check-in done',
                security: cookieAuth,
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['contractType'], properties: { contractType: { type: 'string', enum: ['rental', 'return'] } } } } } },
                responses: { 201: { description: 'Contract created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } } }, 400: errorResponse('The rental contract must be fully signed before creating the return one') },
            },
            get: { tags: ['Contracts'], summary: 'List contracts for a reservation', security: cookieAuth, responses: { 200: { description: 'Contracts list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Contract' } } } } } } },
        },
        '/contracts/{id}': {
            parameters: [idParam('id', 'Contract id')],
            get: { tags: ['Contracts'], summary: 'Get a contract', security: cookieAuth, responses: { 200: { description: 'Contract', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } } } } },
        },
        '/contracts/{id}/otp': {
            parameters: [idParam('id', 'Contract id')],
            post: { tags: ['Contracts'], summary: 'Request a signing OTP by email', security: cookieAuth, responses: { 200: { description: 'OTP sent' } } },
        },
        '/contracts/{id}/sign': {
            parameters: [idParam('id', 'Contract id')],
            post: {
                tags: ['Contracts'],
                summary: 'Sign the contract with checkbox acceptance + OTP',
                description: 'Once both guest and owner have signed, the final PDF is generated and uploaded to storage.',
                security: cookieAuth,
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['otp', 'accepted'], properties: { otp: { type: 'string', pattern: '^\\d{6}$' }, accepted: { type: 'boolean' } } } } } },
                responses: { 200: { description: 'Contract signed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } } }, 400: errorResponse('Invalid or expired OTP') },
            },
        },
        '/reservations/{id}/verifications': {
            parameters: [idParam('id', 'Reservation id')],
            post: {
                tags: ['Verifications'],
                summary: 'Create a check-in or check-out verification. Check-in needs the rent paid, the deposit held and the rental contract signed; check-out needs the return act signed',
                description: 'Creating a check-out verification automatically marks the reservation as completed.',
                security: cookieAuth,
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['verificationType'], properties: { verificationType: { type: 'string', enum: ['check_in', 'check_out'] }, notes: { type: 'string' } } } } } },
                responses: { 201: { description: 'Verification created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Verification' } } } }, 409: errorResponse('This verification already exists') },
            },
            get: { tags: ['Verifications'], summary: 'List verifications for a reservation', security: cookieAuth, responses: { 200: { description: 'Verifications list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Verification' } } } } } } },
        },
        '/verifications/{id}': {
            parameters: [idParam('id', 'Verification id')],
            get: { tags: ['Verifications'], summary: 'Get a verification', security: cookieAuth, responses: { 200: { description: 'Verification', content: { 'application/json': { schema: { $ref: '#/components/schemas/Verification' } } } } } },
            patch: { tags: ['Verifications'], summary: 'Update verification notes', security: cookieAuth, requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Verification updated' } } },
        },
        '/verifications/{id}/photos': {
            parameters: [idParam('id', 'Verification id')],
            get: { tags: ['Verifications'], summary: 'List photos for a verification', security: cookieAuth, responses: { 200: { description: 'Photos list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/VerificationPhoto' } } } } } } },
            post: {
                tags: ['Verifications'],
                summary: 'Upload one or more photos to a shared verification',
                security: cookieAuth,
                requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
                responses: { 201: { description: 'Photos uploaded', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/VerificationPhoto' } } } } } },
            },
        },
        '/verifications/{id}/photos/{photoId}': {
            parameters: [idParam('id', 'Verification id'), idParam('photoId', 'Photo id')],
            delete: { tags: ['Verifications'], summary: 'Delete a photo (only the uploader can delete their own photo)', security: cookieAuth, responses: { 204: { description: 'Photo deleted' }, 403: errorResponse('You can only delete your own photos') } },
        },
        '/payments/onboarding': {
            post: { tags: ['Payments'], summary: 'Start or resume Stripe Connect Express onboarding for the current user (as owner)', security: cookieAuth, responses: { 200: { description: 'Onboarding link', content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' } } } } } } } },
        },
        '/payments/onboarding/status': {
            get: { tags: ['Payments'], summary: 'Check the current user\'s Stripe Connect onboarding status', security: cookieAuth, responses: { 200: { description: 'Onboarding status' } } },
        },
        '/reservations/{id}/payments': {
            parameters: [idParam('id', 'Reservation id')],
            post: {
                tags: ['Payments'],
                summary: 'Create (or reuse) a Stripe Checkout session for the rent (guest only) and return its checkoutUrl. The card is saved and, when the Checkout completes, the deposit is held on it with manual capture. Available from one day before pickup so the deposit hold covers the whole rental',
                security: cookieAuth,
                responses: { 201: { description: 'Payment with checkoutUrl (200 when an open session is reused)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } }, 400: errorResponse('Reservation not confirmed or owner not onboarded'), 409: errorResponse('Payment already exists or it is earlier than one day before pickup') },
            },
            get: { tags: ['Payments'], summary: 'Get the payment for a reservation', security: cookieAuth, responses: { 200: { description: 'Payment', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } }, 404: errorResponse('No payment found') } },
        },
        '/payments/{id}/capture-deposit': {
            parameters: [idParam('id', 'Payment id')],
            post: {
                tags: ['Payments'],
                summary: 'Capture the deposit, in full or in part (owner only, requires a check-out verification)',
                security: cookieAuth,
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { amountToCapture: { type: 'number' } } } } } },
                responses: { 200: { description: 'Deposit captured', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } }, 409: errorResponse('No check-out verification yet, or deposit not in an authorized state') },
            },
        },
        '/payments/{id}/release-deposit': {
            parameters: [idParam('id', 'Payment id')],
            post: {
                tags: ['Payments'],
                summary: 'Release the deposit hold (owner only, requires a check-out verification)',
                security: cookieAuth,
                responses: { 200: { description: 'Deposit released', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } }, 409: errorResponse('No check-out verification yet, or deposit not in an authorized state') },
            },
        },
        '/reservations/{id}/disputes': {
            parameters: [idParam('id', 'Reservation id')],
            post: {
                tags: ['Disputes'],
                summary: 'Open a dispute for a reservation (guest or owner), only after the check-in',
                security: cookieAuth,
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' }, requestedCaptureAmount: { type: 'number' } } } } } },
                responses: { 201: { description: 'Dispute opened', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dispute' } } } }, 409: errorResponse('There is already an open dispute for this reservation') },
            },
            get: { tags: ['Disputes'], summary: 'List disputes for a reservation', security: cookieAuth, responses: { 200: { description: 'Disputes list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Dispute' } } } } } } },
        },
        '/disputes': {
            get: { tags: ['Disputes'], summary: 'List all disputes (admin only)', security: cookieAuth, responses: { 200: { description: 'Disputes list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Dispute' } } } } }, 403: errorResponse('Admin only') } },
        },
        '/disputes/{id}': {
            parameters: [idParam('id', 'Dispute id')],
            get: { tags: ['Disputes'], summary: 'Get a dispute (parties or admin)', security: cookieAuth, responses: { 200: { description: 'Dispute', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dispute' } } } } } },
        },
        '/disputes/{id}/start-review': {
            parameters: [idParam('id', 'Dispute id')],
            patch: { tags: ['Disputes'], summary: 'Move an open dispute to under_review (admin only)', security: cookieAuth, responses: { 200: { description: 'Dispute under review' } } },
        },
        '/disputes/{id}/resolve': {
            parameters: [idParam('id', 'Dispute id')],
            patch: {
                tags: ['Disputes'],
                summary: 'Resolve a dispute, optionally capturing or releasing the deposit (admin only)',
                security: cookieAuth,
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['resolution'],
                                properties: {
                                    resolution: { type: 'string' },
                                    depositAction: { type: 'string', enum: ['capture', 'release', 'none'], default: 'none' },
                                    captureAmount: { type: 'number' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: 'Dispute resolved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dispute' } } } } },
            },
        },
    },
};
