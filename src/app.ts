import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import vdemRouter from './routes/vdem.routes';
import imfRouter from './routes/imf.routes';
import analysisRouter from './routes/analysis.routes';

const app: Application = express();

// TODO - Add Helmet for security headers

// TODO - CORS configuration (allow from env-specified origins or all in dev)
const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOrigin: CorsOptions['origin'] = corsOriginEnv
	? corsOriginEnv.split(',').map((s) => s.trim())
	: true; // allow all if not specified (useful in local dev)

const corsOptions: CorsOptions = {
	origin: corsOrigin,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Middleware: parse JSON request bodies
app.use(express.json());

// Domain-specific APIs under /api
app.use('/api/v-dem', vdemRouter);
app.use('/api/imf', imfRouter);
app.use('/api/analysis', analysisRouter);

// Health endpoint
app.get('/api/health', (_req, res) => res.json({ ok: true }));

export default app;
