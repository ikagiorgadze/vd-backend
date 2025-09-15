import { Router } from 'express';
import { explainRelationshipsController, getCorrelationsController } from '../controllers/analysis.controller';

const router = Router();

router.post('/relationships/explain', explainRelationshipsController);

router.get('/relationships/datasets/correlations', getCorrelationsController);

export default router;
