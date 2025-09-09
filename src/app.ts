import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import vdemRouter from './routes/vdem.routes';
import imfRouter from './routes/imf.routes';

const app: Application = express();

// CORS configuration (allow from env-specified origins or all in dev)
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

// Health lives at root, domain-specific APIs under /v-dem and /imf
app.use('/v-dem', vdemRouter);
app.use('/imf', imfRouter);

// Root health (mirrors /v-dem/health & /imf/health if needed later)
app.get('/health', (_req, res) => res.json({ ok: true }));

export default app;
