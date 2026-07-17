import { Request, Response } from 'express';
import { AIService } from '../../../../services/ai/ai.service';

export class ChatbotController {
  static async handleChat(req: Request, res: Response) {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const reply = await AIService.chatWithAssistant(message);

      return res.status(200).json({ reply });
    } catch (error) {
      console.error("Error in ChatbotController:", error);
      return res.status(500).json({ error: "An error occurred while communicating with the AI assistant." });
    }
  }

  static async handleCompanionChat(req: any, res: Response) {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const actor = req.user;
      if (!actor) {
         return res.status(401).json({ error: "User context missing." });
      }

      const reply = await AIService.chatWithCompanion(message, actor);

      return res.status(200).json({ reply });
    } catch (error) {
      console.error("Error in Companion ChatbotController:", error);
      return res.status(500).json({ error: "An error occurred while communicating with the AI Companion." });
    }
  }
}
