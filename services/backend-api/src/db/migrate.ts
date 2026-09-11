/**
 * Standalone migration runner.
 * Usage: tsx src/db/migrate.ts
 */
import 'dotenv/config';
import { migrate, closePool } from './client.js';

async function main() {
  try {
    await migrate();
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
