import { Router } from 'express';
import { ChatbotController } from '../../controllers/ai/chatbot.controller';
import { authMiddleware } from '../../../../middelware/auth.middleware';

const router = Router();

// Public endpoint for the basic widget
router.post('/', ChatbotController.handleChat);

// Authenticated endpoint for the AI Companion workspace
router.post('/companion', authMiddleware, ChatbotController.handleCompanionChat);

export default router;
