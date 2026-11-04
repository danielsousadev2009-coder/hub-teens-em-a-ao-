import pg from 'pg';
import { hashPassword } from '../utils/passwords.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const username = 'admin';
  const email = 'danielsousadev2009@gmail.com';
  const password = 'AdminHubTeens2026!';
  const hashedPassword = hashPassword(password);
  const now = new Date();

  await pool.query(
    `INSERT INTO accounts_user (
      username, email, first_name, last_name, password, role,
      is_superuser, is_staff, is_active, date_joined
    ) VALUES ($1, $2, 'Administrador', 'HUB', $3, 'administrator', true, true, true, $4)
    ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = 'administrator', is_superuser = true, is_staff = true`,
    [username, email, hashedPassword, now]
  );

  console.log('Admin user created successfully!');
  console.log('Username:', username);
  console.log('Password:', password);
  await pool.end();
}

main().catch(console.error);
