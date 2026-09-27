import { createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TITLES = {
    rental: 'CONTRATO DE ALQUILER',
    return: 'ACTA DE DEVOLUCION',
};

export function buildContractText({ contractType, reservation, guest, owner }) {
    return [
        TITLES[contractType],
        '',
        `Objeto: ${reservation.item_title}`,
        `Lugar de recogida y devolucion: ${reservation.pickup_address}`,
        `Periodo: ${reservation.start_date} a ${reservation.end_date}`,
        `Precio por dia: ${reservation.price_per_day} EUR`,
        `Deposito: ${reservation.deposit_amount} EUR`,
        '',
        `Arrendador: ${owner.full_name} (${owner.email}) - Tel: ${owner.phone ?? 'no indicado'}`,
        `Arrendatario: ${guest.full_name} (${guest.email}) - Tel: ${guest.phone ?? 'no indicado'}`,
    ].join('\n');
}

export function hashContent(text) {
    return createHash('sha256').update(text).digest('hex');
}

export async function generateContractPdf({ text, contract, guest, owner }) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([595, 842]); // A4
    const margin = 50;
    let y = page.getHeight() - margin;

    for (const line of text.split('\n')) {
        page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
        y -= 16;
    }

    y -= 24;
    const signatureLines = [
        '--- Firmas (firma electronica simple verificada por codigo OTP) ---',
        `Arrendatario: ${guest.full_name} firmado el ${contract.guest_signed_at?.toISOString()}`,
        `Arrendador: ${owner.full_name} firmado el ${contract.owner_signed_at?.toISOString()}`,
        '',
        `Hash del documento: ${contract.content_hash}`,
    ];
    for (const line of signatureLines) {
        page.drawText(line, { x: margin, y, size: 9, font, color: rgb(0.25, 0.25, 0.25) });
        y -= 14;
    }

    return Buffer.from(await pdfDoc.save());
}
