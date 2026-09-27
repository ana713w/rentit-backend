# Checklist de pruebas de RentIt

Pruebas manuales de principio a fin: flujos, archivos del frontend y del backend, y consultas a la BD para comprobar cada paso.

Las rutas del backend cuelgan de `http://localhost:3000/api/v1`.

## 0. Preparación

- **Usuarios:** crea tres.
  - **A (dueño):** con dirección y teléfono.
  - **B (huésped):** con teléfono.
  - **Admin:** créalo con `npm run seed` (`db/seed-admin.js`).
- **Webhook de Stripe en local** (sin esto los pagos se quedan en `pending`):
  ```bash
  stripe listen --forward-to localhost:3000/api/v1/payments/webhook
  ```
  Copia el `whsec_...` que muestra en `STRIPE_WEBHOOK_SECRET` y reinicia el backend.
- **Tarjetas de test de Stripe:**
  - `4242 4242 4242 4242`: pago correcto.
  - `4000 0000 0000 0002`: rechazada.
  - `4000 0025 0000 3155`: pide 3D Secure.
- **Ventanas:** usa dos navegadores, o una ventana normal y otra de incógnito, para tener a A y B conectados a la vez.

---

## 1. Registro, login y perfil

**Front:** `register-page` / `register-form`, `login-page` / `login-form`, `profile-page` / `profile-form`, `auth-provider`, guards `private-route` y `guest-route`
**Back:** `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me` (`user.controller.js`, `session.controller.js`)

- [ ] Registrarse, cerrar sesión, volver a entrar, y editar teléfono y dirección.
- [ ] Registrarse con un email repetido da **409**.
- [ ] Login con contraseña incorrecta da **401**.
- [ ] Sin sesión, `/reservations` redirige a login. Con sesión, `/login` redirige fuera.
- [ ] La respuesta de `/auth/me` **no** incluye `password_hash` ni `stripe_account_id`.

```sql
SELECT id, email, full_name, phone, address, latitude, longitude FROM users ORDER BY created_at DESC;
SELECT sid, expire FROM session;  -- una fila por sesión abierta; se borra al hacer logout
```

## 2. Admin

**Front:** `admin-promote-page`, `private-route` con `{ admin: true }`
**Back:** `POST /admin/promote`

- [ ] Un usuario normal que entra en `/admin/...` ve la página 403.
- [ ] El admin asciende a otro usuario, que después puede entrar en `/admin/disputes`.

```sql
SELECT a.*, u.email FROM admins a JOIN users u ON u.id = a.user_id;
```

## 3. Objetos (items)

**Front:** `item-create-page`, `item-edit-page`, `my-items-page`, `home-page`, `item-detail-page`, `item-form`, `category-picker`, `item-card` / `item-list`
**Back:** `GET/POST /items`, `GET/PATCH/DELETE /items/:id` (`item.controller.js`)

- [ ] A crea un objeto. Si A no tiene dirección, da **400** "Add your address...".
- [ ] Fianza menor de 3× o mayor de 365× el precio por día da **400**.
- [ ] B intenta editar o borrar el objeto de A y recibe **403**.
- [ ] Desactivar un objeto hace que ya no aparezca en home.

```sql
SELECT id, owner_id, title, price_per_day, deposit_amount, category, is_active FROM items;
```

## 4. Imágenes

**Front:** `item-images-manager`, `file-uploader`, `image-gallery`
**Back:** `/items/:id/images` (`itemImage.controller.js`, `upload.middleware.js`, `storage.service.js`)

- [ ] Subir varias imágenes. La primera queda como portada.
- [ ] Cambiar la portada y borrar la portada. Otra imagen pasa a ser la portada.
- [ ] Una imagen de más de 5 MB da **413**. Un archivo que no es imagen da **400**.
- [ ] El archivo aparece en Firebase Storage en `items/<itemId>/` y desaparece al borrarlo.

```sql
SELECT item_id, is_primary, storage_path FROM item_images ORDER BY item_id, created_at;

-- nunca más de una portada por objeto (debe salir vacío)
SELECT item_id, count(*) FROM item_images WHERE is_primary GROUP BY item_id HAVING count(*) > 1;
```

## 5. Fechas bloqueadas y calendario

**Front:** `blocked-dates-manager`, `availability-calendar`, `date-range-fields`
**Back:** `/items/:id/blocked-dates` (`blockedDate.controller.js`)

- [ ] Bloquear un rango hace que aparezca bloqueado en el calendario del detalle.
- [ ] Un bloqueo que se solapa con otro da **409**.
- [ ] Bloquear fechas que ya tienen una reserva confirmada da **409**.
- [ ] **Fechas desplazadas un día:** comprueba que lo que ves en el calendario coincide exactamente con la BD.

```sql
SELECT item_id,
       to_char(lower(date_range), 'YYYY-MM-DD') AS desde,
       to_char(upper(date_range), 'YYYY-MM-DD') AS hasta,
       reason
FROM item_blocked_dates;
```

## 6. Reservas

**Front:** `reservation-request-form` (en item-detail), `reservations-page`, `reservation-detail-page`, `reservation-actions`, `reservation-timeline`, `reservation-card`
**Back:** `POST /reservations`, `GET /reservations/mine|owner|:id`, `PATCH /reservations/:id/accept|reject|cancel` (`reservation.controller.js`)

- [ ] B pide una reserva y queda en `pending`. A la ve en su pestaña de dueño.
- [ ] A intenta reservar su propio objeto y recibe **400**. Reservar fechas bloqueadas o ya confirmadas da **409**.
- [ ] **Dos reservas pendientes que se solapan:** A acepta una y la otra pasa sola a `rejected`.
- [ ] Rechazar funciona. Cancelar funciona desde `pending` y desde `confirmed`, por huésped o por dueño.
- [ ] Un tercer usuario que abre `/reservations/:id` recibe **403**.

```sql
SELECT id, item_id, guest_id, status,
       to_char(lower(date_range), 'YYYY-MM-DD') AS desde,
       to_char(upper(date_range), 'YYYY-MM-DD') AS hasta,
       price_per_day, deposit_amount
FROM reservations ORDER BY created_at DESC;

-- no puede haber confirmadas solapadas (debe salir vacío)
SELECT a.id, b.id
FROM reservations a
JOIN reservations b ON a.item_id = b.item_id AND a.id < b.id AND a.date_range && b.date_range
WHERE a.status = 'confirmed' AND b.status = 'confirmed';
```

## 7. Pagos: onboarding del dueño (Stripe Accounts v2)

**Front:** `stripe-onboarding-card`, `stripe-onboarding-complete-page`, `stripe-onboarding-refresh-page`
**Back:** `POST /payments/onboarding`, `GET /payments/onboarding/status` (`payment.controller.js`, `stripe.service.js`)

- [ ] A pulsa el botón de onboarding, rellena los datos de prueba de Stripe y vuelve a `/stripe/onboarding/complete`.
- [ ] Al terminar, el estado muestra `chargesEnabled` y `payoutsEnabled` en `true` (puede tardar unos segundos).
- [ ] Si pulsa otra vez, reutiliza la misma cuenta en lugar de crear otra.

```sql
SELECT email, stripe_account_id FROM users WHERE stripe_account_id IS NOT NULL;
```

## 8. Pagos: el huésped paga

**Front:** `payment-section`, `stripe-payment-form`, `payment-summary`, `lib/stripe.js`
**Back:** `POST/GET /reservations/:id/payments` y el webhook `POST /payments/webhook`

- [ ] Pagar una reserva sin confirmar da **400**. Si el dueño no tiene onboarding, **400**. Si paga el dueño, **403**. Si se paga dos veces, **409**.
- [ ] Pago con `4242...`: tras el webhook, `rent_status` pasa a `succeeded` y `deposit_status` a `authorized`.
- [ ] Pago con `...0002` rechazada: queda en `failed`.
- [ ] En el Dashboard de Stripe: el alquiler aparece con la comisión (`application_fee`) y la transferencia al dueño; la fianza aparece como "No capturado".
- [ ] Cancelar una reserva confirmada ya pagada: `rent_status` pasa a `refunded` y `deposit_status` a `canceled`.

```sql
SELECT reservation_id, rent_amount, platform_fee_amount, rent_status,
       deposit_amount, deposit_status, deposit_captured_amount
FROM payments;
-- comisión = rent_amount * PLATFORM_FEE_PERCENT / 100
```

## 9. Contratos

**Front:** `contracts-section`, `contract-card`
**Back:** `POST/GET /reservations/:id/contracts`, `GET /contracts/:id`, `POST /contracts/:id/otp`, `POST /contracts/:id/sign` (`contract.controller.js`, `contract.service.js`)

- [ ] Crear un contrato en una reserva `pending` da **400**. Crear el `rental` dos veces da **409**.
- [ ] Crear el `return` antes de que el `rental` esté firmado por los dos da **400**.
- [ ] Pedir el código: llega el email.
  - Un código incorrecto da **400**. A los 10 minutos el código caduca y también da **400**.
  - Firmar sin marcar la casilla da **400**.
- [ ] Firma una parte y después la otra. Aparece `document_url` y el PDF se descarga, con dirección y teléfonos de ambas partes.

```sql
SELECT contract_type, content_hash,
       guest_signed_at, guest_signature_ip,
       owner_signed_at, owner_signature_ip,
       guest_otp_hash IS NOT NULL AS guest_otp_pendiente,
       owner_otp_hash IS NOT NULL AS owner_otp_pendiente,
       document_url
FROM contracts WHERE reservation_id = '<id>';
-- tras firmar, el otp_hash de esa parte vuelve a NULL
```

## 10. Verificaciones (check-in y check-out)

**Front:** `verifications-section`, `verification-card`, `photo-grid`
**Back:** `POST/GET /reservations/:id/verifications`, `GET/PATCH /verifications/:id`, `/verifications/:id/photos` (`verification.controller.js`)

- [ ] Crear el `check_out` sin haber hecho el `check_in` da **400**. Crear el mismo tipo dos veces da **409**.
- [ ] A y B suben fotos a la misma verificación.
  - Cada uno solo puede borrar las suyas; borrar una foto del otro da **403**.
- [ ] Editar notas funciona.

```sql
SELECT v.verification_type, v.notes, p.uploaded_by, p.storage_path
FROM verifications v
LEFT JOIN verification_photos p ON p.verification_id = v.id
WHERE v.reservation_id = '<id>';
```

## 11. Fianza: capturar o liberar

**Front:** `deposit-actions`
**Back:** `POST /payments/:id/capture-deposit`, `POST /payments/:id/release-deposit`

- [ ] Sin check-out da **409**. Si lo intenta el huésped, **403**.
- [ ] **Captura parcial:** `deposit_status` pasa a `captured` con el importe correcto en `deposit_captured_amount`. En Stripe se captura esa cantidad y el resto se libera.
- [ ] En otra reserva, liberar: `deposit_status` pasa a `released`.
- [ ] Intentar la acción otra vez da **409**.

```sql
SELECT deposit_status, deposit_amount, deposit_captured_amount FROM payments WHERE reservation_id = '<id>';
```

## 12. Disputas

**Front:** `disputes-section`, `dispute-form`, `dispute-card`, `admin-disputes-page`, `resolve-dispute-form`
**Back:** `POST/GET /reservations/:id/disputes`, `GET /disputes` (admin), `GET /disputes/:id`, `PATCH /disputes/:id/start-review`, `PATCH /disputes/:id/resolve` (`dispute.controller.js`)

- [ ] B abre una disputa (motivo de al menos 10 caracteres). Abrir una segunda mientras hay una activa da **409**.
- [ ] El admin la pasa a revisión y la resuelve con cada `depositAction`: `capture` (con importe), `release` y `none`. `payments` se actualiza según la acción.
- [ ] Resolver una disputa ya resuelta da **409**. Una reserva sin pago, con acción `capture` o `release`, da **400**.
- [ ] Cuando se resuelve, se puede abrir una disputa nueva.

```sql
SELECT status, reason, requested_capture_amount, resolution, resolved_by, resolved_at
FROM disputes WHERE reservation_id = '<id>';
```

## 13. Otros del frontend

- [ ] **Favoritos:** `favorite-button`, `favorites-page`, `use-favorites`. Se guardan solo en el navegador (no hay tabla en la BD): comprueba que persisten al recargar.
- [ ] Páginas 404 y 403, y la navegación en móvil (`bottom-nav`).
- [ ] Swagger en `http://localhost:3000/api/v1/docs` responde.

---

## ⚠️ Problemas que he visto al revisar

1. **Nada pasa una reserva a `completed`.** El estado existe en la BD, pero ningún endpoint lo asigna. Habría que marcarla completada, por ejemplo al crear el check-out o al gestionar la fianza.
2. **Retención de la fianza:** Stripe mantiene las autorizaciones sin capturar solo **unos 7 días**. En alquileres más largos, o si el dueño tarda en actuar, la retención caduca y `capture` falla.
3. **Hash del contrato:** el PDF vuelve a generar el texto al firmar, así que si cambian la dirección, el teléfono o el nombre entre la creación y la firma, el PDF ya no coincide con `content_hash`.
4. **Sin webhook, los pagos se quedan en `pending`:** acuérdate de tener `stripe listen` en marcha mientras pruebas.
