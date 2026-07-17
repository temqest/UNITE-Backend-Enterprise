import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABSE_SERVICE_ROLE_KEY || '');

export class VectorService {
  /**
   * Generates embeddings for a given text using Gemini's text-embedding-004
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: text,
      config: {
        outputDimensionality: 768,
      }
    });
    return response.embeddings?.[0]?.values || [];
  }

  /**
   * Searches the database for similar documents
   */
  static async searchDocuments(query: string, matchCount = 3): Promise<any[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Call the postgres RPC function we created in the migration
    const { data, error } = await supabase.rpc('match_chatbot_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7, // Only return moderately good matches
      match_count: matchCount,
    });

    if (error) {
      console.error("Error searching vector database:", error);
      throw error;
    }

    return data || [];
  }
}
