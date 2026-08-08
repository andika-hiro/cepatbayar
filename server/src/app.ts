import 'express-async-errors';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth';
import tripsRouter from './routes/trips';
import subTripsRouter from './routes/subtrips';

export function createApp() {
  const app = express();
  // Trust the first hop (Apache reverse proxy on cPanel/Passenger) so
  // req.ip is derived from X-Forwarded-For instead of always resolving to
  // the proxy's own address — otherwise every client shares one rate-limit
  // bucket. Do not use `true` (trusts the whole XFF chain, spoofable) or a
  // number higher than the actual proxy hop count.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/trips/:publicId/subtrips', subTripsRouter);

  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    const indexPath = path.join(publicDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      res.status(404).send('Not built yet — build the client and copy its output into server/public, or use the Vite dev server during development.');
      return;
    }
    res.sendFile(indexPath);
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
