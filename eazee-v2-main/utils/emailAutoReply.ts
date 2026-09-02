import { GoogleGenAI } from "@google/genai";
import { EmailWithSummary } from "@/types/email";

interface AutoReplyResponse {
  reply?: string;
  replyDraft: string;
  actionItems: {
    type: 'SEND_DOCUMENT' | 'UPLOAD' | 'SCHEDULE_MEETING' | 'OTHER';
    description: string;
    status: 'PENDING' | 'COMPLETED';
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
}

//TODO: create an express server for this instead to mask API key (requests should only be accepted by this app)
const genAI = new GoogleGenAI({ apiKey: 'AIzaSyARFjyPbH_A2e-C-Cc2oAcKDcZwKG62auI' });

export async function generateAutoReply(email: EmailWithSummary): Promise<AutoReplyResponse> {
  const prompt = `Analyze the following email and generate two things:
  1. A brief, professional auto-reply
  2. One main action item that needs to be completed

  Subject: ${email.subject}
  From: ${email.from}
  Content: ${email.snippet}

  Important guidelines for the reply:
  1. Use "I" instead of "we" for a personal touch
  2. Analyze the email's intent and provide a clear, direct response:
     - For sales/marketing: Decline politely with a specific business reason
     - For urgent matters: Provide an immediate solution or alternative contact
     - For feedback requests: Give a direct opinion or clear decision
     - For general inquiries: Provide a concrete answer or clear direction
  3. Reference specific details from their email
  4. Keep responses between 2-4 sentences
  5. Avoid any time-specific commitments or references

  Format your response exactly like this, keep it as terse as possible:
  {
    "reply": "Your reply text here",
    "actionItems": [
      {
        "type": "SEND_DOCUMENT" | "UPLOAD" | "SCHEDULE_MEETING" | "OTHER",
        "description": "Detailed description of the task",
        "status": "PENDING",
        "priority": "HIGH" | "MEDIUM" | "LOW"
      }
    ]
  }
    Keep action item descriptions concise and direct. Do not include:
  - Alternative locations
  - Additional suggestions
  - Conditional statements
  Example: "Upload offer letter to Google Drive" instead of "Upload offer letter to Google Drive or suitable alternative location"
    

  Please generate an appropriate response based on these guidelines. My Name is David`;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    const responseText = String(result.text || "")
      .trim()
      .replace(/```json\n?/g, '')  
      .replace(/```\n?/g, '');     
    
    let parsedResponse: AutoReplyResponse;
    try {
      parsedResponse = JSON.parse(responseText);
      
      // Validate the response structure
      if (!parsedResponse.reply || !Array.isArray(parsedResponse.actionItems)) {
        throw new Error('Invalid response structure');
      }

      console.log(parsedResponse.actionItems)
      
      return {
        replyDraft: parsedResponse.reply,
        actionItems: parsedResponse.actionItems.map(item => ({
          type: item.type || 'OTHER',
          description: item.description,
          status: item.status || 'PENDING',
          priority: item.priority || 'MEDIUM'
        }))
      };
    } catch {
      console.error('Failed to parse API response:', responseText);
      throw new Error('Invalid response format from AI model');
    }
  } catch (error: any) {
    // Normalize and rethrow with useful message for UI layer
    const message = (error && (error.message || error.error || error.toString())) || '';
    const text = (typeof message === 'string' ? message : JSON.stringify(message)).toLowerCase();
    if (text.includes('quota')) {
      throw new Error('AI_QUOTA_EXCEEDED');
    }
    if (text.includes('rate limit') || text.includes('429')) {
      throw new Error('AI_RATE_LIMITED');
    }
    if (text.includes('api key') || text.includes('unauthorized') || text.includes('authentication')) {
      throw new Error('AI_API_KEY_ERROR');
    }
    if (text.includes('network') || text.includes('timeout')) {
      throw new Error('AI_NETWORK_ERROR');
    }
    console.error('Error generating auto reply:', error);
    throw new Error('AI_UNKNOWN_ERROR');
  }
}
