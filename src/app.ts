import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env, corsOrigins } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

import readingsRouter from './routes/readings';
import commandsRouter from './routes/commands';
import visionRouter from './routes/vision';
import eventsRouter from './routes/events';
import devicesRouter from './routes/devices';
import sunRouter from './routes/sun';
import energyRouter from './routes/energy';
import healthRouter from './routes/health';
import dashboardRouter from './routes/dashboard';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  frameguard: { action: 'deny' },

  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: corsOrigins,

  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: env.FRONTEND_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.FRONTEND_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api/', apiLimiter);

app.use('/health', healthRouter);
app.use('/api/readings', readingsRouter);
app.use('/api/commands', commandsRouter);
app.use('/api/vision', visionRouter);
app.use('/api/events', eventsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/sun', sunRouter);
app.use('/api/energy', energyRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

export default app;
