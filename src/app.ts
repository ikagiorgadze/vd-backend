import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import dataRouter from './routes/data.routes';

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

// Register routes (all ERT API routes are defined in dataRouter)
app.use('/', dataRouter);

export default app;
