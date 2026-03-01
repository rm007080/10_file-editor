import { createExpressApp, startServer } from './app.js';

const app = createExpressApp({ enableCors: true });

startServer(app, {
  port: Number(process.env.PORT) || 3001,
  host: '127.0.0.1',
}).catch((err) => {
  console.error('[Startup] Fatal error:', err);
  process.exit(1);
});
