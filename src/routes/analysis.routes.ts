import { Router } from 'express';
import { explainRelationshipsController } from '../controllers/analysis.controller';

const router = Router();

router.post('/relationships/explain', explainRelationshipsController);

export default router;