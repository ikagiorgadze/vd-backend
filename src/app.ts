import express, { Application } from 'express';
import dataRouter from './routes/data.routes';

const app: Application = express();

// Middleware: parse JSON request bodies
app.use(express.json());

// Register routes (all ERT API routes are defined in dataRouter)
app.use('/', dataRouter);

export default app;
