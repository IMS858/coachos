// Test-only cluster roles are shared even when suites use separate databases.
// Initialize once before parallel node:test workers. Never accepts a hosted URL.
const { Client } = require('pg');
async function prepare() {
  const raw = process.env.IMS_TEST_DATABASE_URL;
  if (!raw) return;
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/ims_ci') {
    throw new Error('Test role initialization requires isolated local ims_ci.');
  }
  const db = new Client({ connectionString: raw });
  await db.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(54083)');
    await db.query(`
      do $$begin create role anon; exception when duplicate_object then null; end$$;
      do $$begin create role authenticated; exception when duplicate_object then null; end$$;
      do $$begin create role service_role; exception when duplicate_object then null; end$$;
      alter role anon nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
      alter role authenticated nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
      alter role service_role nosuperuser nocreatedb nocreaterole noreplication bypassrls;
    `);
    await db.query('commit');
  } finally { await db.end(); }
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
