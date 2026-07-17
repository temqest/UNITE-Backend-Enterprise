import { VectorService } from '../src/services/ai/vector.service';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABSE_SERVICE_ROLE_KEY!);

const KNOWLEDGE_BASE = [
  "To donate blood, you must be at least 17 years old (or 16 with parental consent depending on state laws), weigh at least 110 pounds, and be in good general health and feeling well.",
  "You should drink an extra 16 oz. of water and fluids before the donation, and eat a healthy meal before your donation. Avoid fatty foods.",
  "You cannot donate if you have a cold, flu, or fever on the day of donation.",
  "The entire blood donation process usually takes about an hour, but the actual donation itself only takes 8-10 minutes.",
  "O-negative blood is the universal red cell donor and can be given to anyone. AB-positive is the universal plasma donor.",
  "You can donate whole blood every 56 days, up to 6 times a year."
];

async function seedKnowledge() {
  console.log("Seeding AI Knowledge Base into Supabase Vector DB...");

  for (const text of KNOWLEDGE_BASE) {
    try {
      console.log(`Generating embedding for: "${text.substring(0, 30)}..."`);
      const embedding = await VectorService.generateEmbedding(text);
      
      const { error } = await supabase
        .from('chatbot_documents')
        .insert({
          content: text,
          embedding: embedding,
          metadata: { source: 'standard_guidelines' }
        });

      if (error) {
        console.error("Error inserting document:", error);
      } else {
        console.log("Successfully inserted document.");
      }
    } catch (e) {
      console.error("Error processing document:", e);
    }
  }
  
  console.log("Seeding complete!");
}

seedKnowledge().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
