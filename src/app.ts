import path from 'path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { authRouter } from './routes/auth.routes';
import { patientRouter } from './routes/patient.routes';
import { riskRouter } from './routes/risk.routes';
import { alertRouter } from './routes/alert.routes';
import { notificationRouter } from './routes/notification.routes';
import { ussdRouter } from './routes/ussd.routes';

export function createApp(): Express {
  const app = express();

  // helmet's default CSP would block the simulator's inline <script>. Disable
  // CSP only — the rest of helmet's headers (HSTS, X-Frame-Options, etc) stay.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());

  // Static assets — currently just the USSD simulator. Served before the
  // routers so /ussd-simulator.html resolves without going through them.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/patients', patientRouter);
  app.use('/api/risk', riskRouter);
  app.use('/api/alerts', alertRouter);
  app.use('/api/notifications', notificationRouter);

  // USSD lives at /ussd (no /api prefix) per the §0 deployment diagram.
  // The router mounts its own urlencoded body parser — do NOT add another.
  app.use('/ussd', ussdRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
