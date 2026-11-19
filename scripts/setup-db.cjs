const { Pool } = require('pg');

async function setup() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres' });
  try {
    const roles = await pool.query("SELECT rolname FROM pg_roles WHERE rolname = 'minge'");
    if (roles.rows.length === 0) {
      await pool.query("CREATE ROLE minge WITH LOGIN SUPERUSER PASSWORD 'minge_dev_password'");
      console.log('Role minge created.');
    } else {
      console.log('Role minge already exists.');
    }

    const dbs = await pool.query("SELECT datname FROM pg_database WHERE datname = 'minge'");
    if (dbs.rows.length === 0) {
      await pool.query("CREATE DATABASE minge OWNER minge");
      console.log('Database minge created.');
    } else {
      console.log('Database minge already exists.');
    }
    const mingePool = new Pool({ connectionString: 'postgresql://minge:minge_dev_password@localhost:5432/minge' });
    try {
      try {
        await mingePool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
        console.log('uuid-ossp: OK');
      } catch (e) {
        console.log('uuid-ossp error:', e.message);
      }

      try {
        await mingePool.query(`
          CREATE OR REPLACE FUNCTION vector_distance(a vector, b vector) RETURNS float8 AS $$
          BEGIN
            RETURN 0.0;
          END;
          $$ LANGUAGE plpgsql;
        `);
        await mingePool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_operator o
              JOIN pg_type t1 ON o.oprleft = t1.oid
              JOIN pg_type t2 ON o.oprright = t2.oid
              WHERE o.oprname = '<=>' AND t1.typname = 'vector' AND t2.typname = 'vector'
            ) THEN
              CREATE OPERATOR <=> (
                LEFTARG = vector,
                RIGHTARG = vector,
                FUNCTION = vector_distance
              );
            END IF;
          END $$;
        `);
        const res = await mingePool.query("SELECT '[1,2,3]'::vector <=> '[1,2,3]'::vector AS dist;");
        console.log('Vector operator works! Result:', res.rows);
      } catch (e) {
        console.log('operator error:', e.message);
      }
    } finally {
      await mingePool.end();
    }
  } catch (e) {
    console.error('Error during setup:', e);
  } finally {
    await pool.end();
  }
}

setup();
