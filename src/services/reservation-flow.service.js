import createError from 'http-errors';
import { db } from '../db/index.js';

// Orden del alquiler:
// pago + contrato de entrega (desde el dia antes) -> check-in -> acta de devolucion -> check-out
// El pago se abre el dia antes de la recogida para que la fianza
// (Stripe la retiene unos 7 dias) cubra todo el alquiler (MAX_RENTAL_DAYS = 6)
export const DAYS_BEFORE_PICKUP = 1;

const DAY_MS = 24 * 60 * 60 * 1000;
// fecha de hoy en Espana (el servidor puede estar en UTC)
const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

export function preparationOpensOn(startDate) {
    return new Date(Date.parse(startDate) - DAYS_BEFORE_PICKUP * DAY_MS).toISOString().slice(0, 10);
}

export function ensurePreparationOpen(startDate) {
    const opensOn = preparationOpensOn(startDate);
    if (todayIso() < opensOn) {
        throw createError(409, `Payment and rental contract are available from ${opensOn}, one day before pickup`);
    }
}

const isFullySigned = (contract) => Boolean(contract?.guest_signed_at && contract?.owner_signed_at);

async function findContract(reservationId, contractType) {
    const { rows } = await db.query(
        'SELECT guest_signed_at, owner_signed_at FROM contracts WHERE reservation_id = $1 AND contract_type = $2',
        [reservationId, contractType]
    );
    return rows[0];
}

export async function hasVerification(reservationId, verificationType) {
    const { rows } = await db.query(
        'SELECT id FROM verifications WHERE reservation_id = $1 AND verification_type = $2',
        [reservationId, verificationType]
    );
    return rows.length > 0;
}

export async function ensureRentalContractSigned(reservationId) {
    if (!isFullySigned(await findContract(reservationId, 'rental'))) {
        throw createError(409, 'The rental contract must be signed by both parties first');
    }
}

// Check-in: alquiler cobrado, fianza retenida y contrato de entrega firmado
export async function ensureReadyForCheckIn(reservationId) {
    const { rows } = await db.query(
        'SELECT rent_status, deposit_status FROM payments WHERE reservation_id = $1',
        [reservationId]
    );
    const payment = rows[0];
    if (!payment || payment.rent_status !== 'succeeded' || payment.deposit_status !== 'authorized') {
        throw createError(409, 'The rent must be paid and the deposit held before the check-in');
    }
    await ensureRentalContractSigned(reservationId);
}

// Check-out: check-in hecho y acta de devolucion firmada
export async function ensureReadyForCheckOut(reservationId) {
    if (!(await hasVerification(reservationId, 'check_in'))) {
        throw createError(409, 'The check-in must be done before the check-out');
    }
    if (!isFullySigned(await findContract(reservationId, 'return'))) {
        throw createError(409, 'The return act must be signed by both parties before the check-out');
    }
}
