import { VectorService } from './vector.service';
import { createClient } from '@supabase/supabase-js';
import { EventService } from '../events/event.service';
import { supabaseServer } from '../../lib/supabase/supabase.client';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABSE_SERVICE_ROLE_KEY || '');
const eventService = new EventService(supabaseServer);

export class AIService {
  /**
   * Generates a response from the AI assistant using RAG
   */
  static async chatWithAssistant(userMessage: string): Promise<string> {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // 1. Retrieve relevant knowledge from Vector DB
      const relevantDocs = await VectorService.searchDocuments(userMessage);
      
      // 2. Build the context string
      let contextStr = "";
      if (relevantDocs && relevantDocs.length > 0) {
        contextStr = "Here is some relevant information from the UNITE Bloodbank Operations Manual:\n";
        for (const doc of relevantDocs) {
          contextStr += `- ${doc.content}\n`;
        }
      }

      // Fetch upcoming events to always provide live context
      const today = new Date().toISOString().split('T')[0];
      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('title, event_date, start_time, end_time, address, status, description, actual_collected_bags, actual_donors')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(5);

      // Fetch recent past events for stats
      const { data: pastEvents } = await supabase
        .from('events')
        .select('title, event_date, address, status, actual_collected_bags, actual_donors')
        .lt('event_date', today)
        .order('event_date', { ascending: false })
        .limit(5);

      let eventsStr = "\nUPCOMING EVENTS:\n";
      if (upcomingEvents && upcomingEvents.length > 0) {
        for (const e of upcomingEvents) {
          eventsStr += `- "${e.title}" at ${e.address} on ${e.event_date}. Status: ${e.status}. Details: ${e.description || 'N/A'}.`;
          if (e.actual_collected_bags !== null) {
            eventsStr += ` (Collected: ${e.actual_collected_bags} bags from ${e.actual_donors || 0} donors)`;
          }
          eventsStr += "\n";
        }
      } else {
        eventsStr += "There are no upcoming events scheduled right now.\n";
      }

      eventsStr += "\nRECENTLY COMPLETED EVENTS & STATS:\n";
      if (pastEvents && pastEvents.length > 0) {
        for (const e of pastEvents) {
          eventsStr += `- "${e.title}" on ${e.event_date}. Blood units collected: ${e.actual_collected_bags || 0} bags from ${e.actual_donors || 0} donors.\n`;
        }
      } else {
        eventsStr += "No recent completed events on record.\n";
      }

      // 3. Construct the system prompt
      const systemPrompt = `You are the UNITE Bloodbank Operations Assistant. 
You answer questions politely and concisely. 
Do NOT provide medical advice. 
Use the following context and upcoming events to answer the user's question. If the answer is not in the context, state that clearly and offer to connect them with a human operator.

CONTEXT:
${contextStr}${eventsStr}`;

      // 4. Call AI Provider
      if (process.env.ACTIVE_AI_PROVIDER === 'groq') {
        const Groq = (await import('groq-sdk')).default;
        const groq = new Groq({ apiKey: process.env.AI_API_KEY });
        const completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.3,
        });
        return completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
      } else {
        const response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: [
            { role: 'user', parts: [{ text: userMessage }] }
          ],
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.3, // keep it factual
          }
        });
        return response.text || "I'm sorry, I couldn't generate a response.";
      }
    } catch (error) {
      console.error("Error in chatWithAssistant:", error);
      throw new Error("Failed to generate AI response.");
    }
  }

  /**
   * Agentic Companion: Can read data and EXECUTE actions via tools.
   */
  static async chatWithCompanion(userMessage: string, actor: any, history: any[] = []): Promise<{text: string, ui?: any}> {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const eventActor = {
        id: actor.id,
        org_id: actor.org_id,
        role: {
          type: actor.canonical_role || actor.role?.type,
          permissions: actor.role?.permissions || []
        },
        geographic_area: null,
        is_active: actor.is_active !== false
      };

      // 1. Retrieve relevant knowledge from Vector DB
      const relevantDocs = await VectorService.searchDocuments(userMessage);
      
      let contextStr = "";
      if (relevantDocs && relevantDocs.length > 0) {
        contextStr = "Here is some relevant information from the UNITE Bloodbank Operations Manual:\n";
        for (const doc of relevantDocs) {
          contextStr += `- ${doc.content}\n`;
        }
      }

      // 2. Fetch upcoming and past events
      const today = new Date().toISOString().split('T')[0];
      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('title, event_date, start_time, end_time, address, status, description, actual_collected_bags, actual_donors')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(10);

      const { data: pastEvents } = await supabase
        .from('events')
        .select('title, event_date, address, status, actual_collected_bags, actual_donors')
        .lt('event_date', today)
        .order('event_date', { ascending: false })
        .limit(5);

      let eventsStr = "\nUPCOMING EVENTS:\n";
      if (upcomingEvents && upcomingEvents.length > 0) {
        for (const e of upcomingEvents) {
          eventsStr += `- "${e.title}" at ${e.address || 'Location TBD'} on ${e.event_date}. Status: ${e.status}. Details: ${e.description || 'N/A'}.`;
          if (e.actual_collected_bags !== null) {
            eventsStr += ` (Collected: ${e.actual_collected_bags} bags from ${e.actual_donors || 0} donors)`;
          }
          eventsStr += "\n";
        }
      } else {
        eventsStr += "There are no upcoming events scheduled right now.\n";
      }

      eventsStr += "\nRECENTLY COMPLETED EVENTS & STATS:\n";
      if (pastEvents && pastEvents.length > 0) {
        for (const e of pastEvents) {
          eventsStr += `- "${e.title}" on ${e.event_date}. Blood units collected: ${e.actual_collected_bags || 0} bags from ${e.actual_donors || 0} donors.\n`;
        }
      } else {
        eventsStr += "No recent completed events on record.\n";
      }

      // 3. Fetch Organization Settings
      const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('org_id', eventActor.org_id)
        .maybeSingle();
      
      let settingsStr = "";
      if (orgSettings) {
        settingsStr = "\nORGANIZATION SETTINGS (IMPORTANT RULES YOU MUST FOLLOW):\n";
        if (orgSettings.banned_days_of_week?.length) {
          settingsStr += `- Banned days of the week (DO NOT schedule events on these days): ${orgSettings.banned_days_of_week.join(', ')}\n`;
        }
        if (orgSettings.banned_specific_dates?.length) {
          settingsStr += `- Banned specific dates (DO NOT schedule events on these dates): ${orgSettings.banned_specific_dates.join(', ')}\n`;
        }
        if (orgSettings.max_events_per_day) {
          settingsStr += `- Maximum allowed events per day: ${orgSettings.max_events_per_day}\n`;
        }
      }

      const systemPrompt = `You are the UNITE AI Companion.
Your goal is to assist admins with managing the bloodbank. 
You can answer questions using the provided context, and you have the ability to execute actions like creating events.
If the user asks to create an event, you MUST use the create_event tool. DO NOT say you cannot do it.

IMPORTANT FORMATTING RULES:
- When listing events, format them nicely using Markdown bullet points. Bold the event **Title**, and write out the dates naturally (e.g. "October 12, 2026"). Make it highly readable.

CONTEXT:
${contextStr}${eventsStr}${settingsStr}`;

      if (process.env.ACTIVE_AI_PROVIDER === 'groq') {
        const Groq = (await import('groq-sdk')).default;
        const groq = new Groq({ apiKey: process.env.AI_API_KEY });
        
        const groqMessages = [
          { role: 'system', content: systemPrompt },
          ...history.map((m: any) => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts[0].text
          })),
          { role: 'user', content: userMessage }
        ];

        const groqTools = [{
          type: 'function',
          function: {
            name: 'create_event',
            description: 'Creates a new event (e.g., blood drive, training).',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'The title of the event.' },
                event_date: { type: 'string', description: 'The date of the event in YYYY-MM-DD format.' },
                type: { type: 'string', description: 'Type of event: blood_drive, training, advocacy, or assembly.' },
                address: { type: 'string', description: 'The address or location name of the event.' }
              },
              required: ['title', 'event_date', 'type', 'address']
            }
          }
        }];

        const completion = await groq.chat.completions.create({
          messages: groqMessages as any,
          model: 'llama-3.3-70b-versatile',
          tools: groqTools as any,
          temperature: 0.1,
        });

        const responseMessage = completion.choices[0]?.message;

        if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
          const toolCall = responseMessage.tool_calls[0];
          if (toolCall.function.name === 'create_event') {
            const args = JSON.parse(toolCall.function.arguments);
            const eventPayload = {
              title: args.title,
              type: args.type,
              event_date: args.event_date,
              start_time: '08:00:00',
              end_time: '17:00:00',
              location_type: 'custom',
              address: args.address,
              status: 'draft',
              visibility: 'public',
              org_id: eventActor.org_id
            };

            const result = await eventService.createEvent(eventActor as any, eventPayload as any);
            
            if (result.error) {
              return { text: `I was unable to schedule the event "${args.title}" because: ${result.error.message}` };
            } else {
              return {
                text: `I have successfully scheduled the event "${args.title}" on ${args.event_date} at ${args.address}!`,
                ui: {
                  type: 'EventCard',
                  props: {
                    id: result.data!.id,
                    title: result.data!.title,
                    event_date: result.data!.event_date,
                    address: result.data!.address,
                    status: result.data!.status,
                    type: result.data!.type
                  }
                }
              };
            }
          }
        }

        return { text: responseMessage?.content || "I'm sorry, I couldn't process your request." };
      } else {
        const tools: any = [
          {
            functionDeclarations: [
              {
                name: 'create_event',
                description: 'Creates a new event (e.g., blood drive, training).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING', description: 'The title of the event.' },
                    event_date: { type: 'STRING', description: 'The date of the event in YYYY-MM-DD format.' },
                    type: { type: 'STRING', description: 'Type of event: blood_drive, training, advocacy, or assembly.' },
                    address: { type: 'STRING', description: 'The address or location name of the event.' }
                  },
                  required: ['title', 'event_date', 'type', 'address']
                }
              }
            ]
          }
        ];

        const response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: [
            ...history,
            { role: 'user', parts: [{ text: userMessage }] }
          ],
          config: {
            systemInstruction: systemPrompt,
            tools: tools,
            temperature: 0.1
          }
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
          const call = response.functionCalls[0];
          if (call.name === 'create_event') {
            const args = call.args as any;
            
            const eventPayload = {
              title: args.title,
              type: args.type,
              event_date: args.event_date,
              start_time: '08:00:00',
              end_time: '17:00:00',
              location_type: 'custom',
              address: args.address,
              status: 'draft',
              visibility: 'public',
              org_id: eventActor.org_id
            };

            const result = await eventService.createEvent(eventActor as any, eventPayload as any);
            
            if (result.error) {
              return { text: `I was unable to schedule the event "${args.title}" because: ${result.error.message}` };
            } else {
              return {
                text: `I have successfully scheduled the event "${args.title}" on ${args.event_date} at ${args.address}!`,
                ui: {
                  type: 'EventCard',
                  props: {
                    title: result.data!.title,
                    event_date: result.data!.event_date,
                    address: result.data!.address,
                    status: result.data!.status,
                    type: result.data!.type
                  }
                }
              };
            }
          }
        }

        return { text: response.text || "I'm sorry, I couldn't process your request." };
      }
    } catch (error) {
      console.error("Error in chatWithCompanion:", error);
      throw new Error("Failed to communicate with AI Companion.");
    }
  }
}
