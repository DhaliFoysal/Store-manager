import { env } from './core/env.js';
import { prisma } from './core/db.js';
import { createApp } from './app.js';

const app = await createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Store Manager API listening on :${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
