import 'dotenv/config';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

/**
 * Creates one test tenant + one owner user so you have something to log in
 * with before the real signup flow exists. Safe to re-run — it checks for
 * an existing tenant with the same business name first.
 *
 * Usage: npm run seed
 * Then log in with: seed-owner@example.com / password123
 */
async function seed() {
  const connectionString = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required. Configure it in backend/.env before seeding.');
  }

  const pool = new Pool({ connectionString });

  const businessName = 'Demo Kariakoo Shop';
  const email = 'seed-owner@example.com';
  const plainPassword = 'password123';

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`kariakoo-seed:${businessName}`]);

      let tenant = await client.query('SELECT id FROM tenants WHERE business_name = $1 LIMIT 1', [
        businessName,
      ]);
      if (tenant.rows.length === 0) {
        tenant = await client.query(
          `INSERT INTO tenants (business_name, business_type, subscription_plan, subscription_status)
           VALUES ($1, 'general_merchandise', 'starter', 'trial')
           RETURNING id`,
          [businessName],
        );
      }
      const tenantId = tenant.rows[0].id;

      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

      const roleResult = await client.query(`SELECT id FROM roles WHERE code = 'owner'`);
      if (roleResult.rows.length === 0) {
        throw new Error('The owner role is missing. Run database migrations before seeding.');
      }

      let branch = await client.query(
        'SELECT id FROM branches WHERE tenant_id = $1 ORDER BY created_at LIMIT 1',
        [tenantId],
      );
      if (branch.rows.length === 0) {
        branch = await client.query(
          `INSERT INTO branches (tenant_id, name, branch_type, is_active)
           VALUES ($1, 'Main Branch', 'both', true)
           RETURNING id`,
          [tenantId],
        );
      }

      const existingUser = await client.query(
        'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
        [tenantId, email],
      );
      const createdUser = existingUser.rows.length === 0;
      if (createdUser) {
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        await client.query(
          `INSERT INTO users (tenant_id, email, password_hash, full_name, role_id)
           VALUES ($1, $2, $3, 'Demo Owner', $4)`,
          [tenantId, email, passwordHash, roleResult.rows[0].id],
        );
      }

      await client.query('COMMIT');
      console.log(`Tenant: ${businessName} (${tenantId})`);
      console.log(`Main branch: ${branch.rows[0].id}`);
      if (createdUser) {
        console.log(`Demo login: ${email} / ${plainPassword} (local development only)`);
      } else {
        console.log(`Existing owner account left unchanged: ${email}`);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
