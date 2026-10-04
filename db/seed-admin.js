// Crea el admin definido en .env: `npm run seed`
// Si ya existe solo se asegura de que sea admin
import bcrypt from 'bcrypt';
import { db } from '../src/db/index.js';
import { registerSchema } from '../src/schemas/auth.schema.js';

const PASSWORD_SALT_ROUNDS = 12;

const adminSchema = registerSchema.pick({ email: true, password: true, fullName: true });

async function seedAdmin() {
    const parsed = adminSchema.safeParse({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        fullName: process.env.ADMIN_NAME || 'Admin RentIt',
    });
    if (!parsed.success) {
        const errors = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
        throw new Error(`Revisa ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME en el .env:\n${errors.join('\n')}`);
    }
    const { email, password, fullName } = parsed.data;

    let { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows[0]) {
        console.log(`El usuario ${email} ya existe, no se cambia su contraseña.`);
    } else {
        const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
        ({ rows } = await db.query(
            'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id',
            [email, passwordHash, fullName]
        ));
        console.log(`Usuario ${email} creado.`);
    }
    const userId = rows[0].id;

    const { rowCount } = await db.query(
        `INSERT INTO admins (user_id)
         SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM admins WHERE user_id = $1)`,
        [userId]
    );
    console.log(rowCount ? `${email} ahora es administrador.` : `${email} ya era administrador.`);
}

try {
    await seedAdmin();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.end();
}
