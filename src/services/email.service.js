import nodemailer from 'nodemailer';

let transporter;

// Lazy: el servidor arranca aunque falte el SMTP
function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }
    return transporter;
}

export async function sendOtpEmail(to, code) {
    await getTransporter().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: 'Codigo de verificacion para firmar tu contrato',
        text: `Tu codigo de verificacion es: ${code}. Caduca en 10 minutos. Si no has solicitado esto, ignora este correo.`,
    });
}
