import { Router } from 'express';
import { getHealth, queryData } from '../controllers/data.controller';

const router = Router();

// Health check route (GET /health)
router.get('/health', getHealth);

// Query route (POST /query) for data queries
router.post('/query', queryData);

export default router;
