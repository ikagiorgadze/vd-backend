import { Router } from 'express';
import { getHealth, queryVdemDataController } from '../controllers/vdem.controller';

const router = Router();

// Health check route (GET /health)
router.get('/health', getHealth);

// Query route (POST /query) for data queries
router.post('/query', queryVdemDataController);

export default router;
