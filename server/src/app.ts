import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth';
import tripsRouter from './routes/trips';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/trips', tripsRouter);

  return app;
}
