import { Router } from 'express';
import { getHealth, queryVdemDataController, explainVdemRelationshipsController } from '../controllers/vdem.controller';

const router = Router();

// Health check route (GET /health)
router.get('/health', getHealth);

// Query route (POST /query) for data queries
router.post('/query', queryVdemDataController);

// Explain relationships route (POST /analysis/relationships/explain)
router.post('/analysis/relationships/explain', explainVdemRelationshipsController);

export default router;
