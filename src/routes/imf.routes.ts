import { Router } from 'express';
import { getHealth, queryImfData } from '../controllers/imf.controller';

const router = Router();

// Health check for IMF domain (GET /imf/health)
router.get('/health', getHealth);

// IMF query (POST /imf/query)
router.post('/query', queryImfData);

export default router;
