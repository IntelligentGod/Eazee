import { GoogleGenAI } from "@google/genai";
import { Email } from "@/types/email";

interface EmailWithSummary extends Email {
  summary: string[];
}

const API_KEYS = [
  "AIzaSyARFjyPbH_A2e-C-Cc2oAcKDcZwKG62auI",
  // "AIzaSyAX8tLppWtP5sJ6lG0tlqdCn5v6Jmt6rSg"
];
let currentApiKeyIndex = 0;
let genAI = new GoogleGenAI({ apiKey: API_KEYS[currentApiKeyIndex] });
const exhaustedKeys = new Set<string>();

function switchToNextApiKey() {
  const initialIndex = currentApiKeyIndex;
  let newKey: string | null = null;

  do {
    currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
    if (!exhaustedKeys.has(API_KEYS[currentApiKeyIndex])) {
      newKey = API_KEYS[currentApiKeyIndex];
      break;
    }
  } while (currentApiKeyIndex !== initialIndex);

  if (newKey === null && API_KEYS.length > 0) { // All keys are currently in the exhausted set
    console.warn("All API keys have recently resulted in a 429 error. Resetting exhausted list and retrying.");
    exhaustedKeys.clear();
    currentApiKeyIndex = (initialIndex + 1) % API_KEYS.length; 
    newKey = API_KEYS[currentApiKeyIndex];
  }
  
  if (newKey) {
    console.log(`Switching to API key index: ${currentApiKeyIndex}`);
    genAI = new GoogleGenAI({ apiKey: newKey });
  } else if (API_KEYS.length > 0) {
    console.error("Failed to switch API key, no available keys. Sticking with the current one.");
  } else {
    console.error("No API keys configured.");
  }
}

const summaryCache = new Map<string, string[]>();

export async function summarizeEmails(
  emails: Email[]
): Promise<EmailWithSummary[]> {
  const summarizedEmails = await Promise.all(
    emails.map(async (email) => {
      const cacheKey = `${email.id}:${email.subject}:${email.from}`;

      if (summaryCache.has(cacheKey)) {
        // console.log("Using cached summary for:", cacheKey);
        return {
          ...email,
          summary: summaryCache.get(cacheKey)!,
        };
      }
      
      const prompt = `Summarize the following email in 3-5 concise bullet points:
    
        Subject: ${email.subject}
        From: ${email.from}
        Content: ${email.snippet}
        
        Provide only the main points without any introductory phrases or formatting.`;

      try {
        const result = await genAI.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: prompt,
        });
        const rawResponse = String(result.text || "");
        // console.log("Raw AI response:", result.response.text());
        const summary = rawResponse
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => line.replace(/^[•*-]\s*/, "").trim())
          .map((line) => line.replace(/\*\*(.*?)\*\*/g, "$1"))
          .map((line) => line.replace(/\*(.*?)\*/g, "$1"))
          .filter(
            (line) =>
              !line.toLowerCase().includes("here is the summary") &&
              !line.toLowerCase().includes("here are the key points") &&
              !line.startsWith("Subject:") &&
              !line.startsWith("Sender:") &&
              !line.startsWith("From:") &&
              !line.startsWith("Content:")
          );
        // console.log("Processed summary:", summary);
        summaryCache.set(cacheKey, summary);

        return {
          ...email,
          summary: summary.length > 0 ? summary : ["No summary generated"],
        };
      } catch (error: any) {
        console.error(`Error summarizing email ${email.id} (using key index ${currentApiKeyIndex}):`, error.message);
        if (error.message && (error.message.includes("Resource has been exhausted") || error.message.includes("[429"))) {
          console.warn(`API key ${API_KEYS[currentApiKeyIndex]} (index ${currentApiKeyIndex}) exhausted or rate limited.`);
          exhaustedKeys.add(API_KEYS[currentApiKeyIndex]);
          
          if (API_KEYS.length > 1) {
            switchToNextApiKey();
          } else {
            console.warn("Only one API key configured. Cannot switch.");
          }
          return {
            ...email,
            summary: ["Error: API rate limit reached. Please try again later."],
          };
        }
        return {
          ...email,
          summary: ["Error generating summary"],
        };
      }
    })
  );

  return summarizedEmails;
}
