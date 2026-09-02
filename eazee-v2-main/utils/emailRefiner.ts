import { GoogleGenAI } from "@google/genai";
import { EmailWithSummary } from "@/types/email";

const genAI = new GoogleGenAI({ apiKey: "AIzaSyARFjyPbH_A2e-C-Cc2oAcKDcZwKG62auI" });

export async function refineEmailDraft(params: {
  email: Pick<EmailWithSummary, "subject" | "from" | "snippet">;
  previousDraft: string;
  instruction: string;
}): Promise<string> {
  const { email, previousDraft, instruction } = params;
  const prompt = `You are rewriting an email reply. Produce a full, concise, professional reply that follows the user's new instruction while preserving the context.

Original email:
Subject: ${String(email.subject || "")}
From: ${String(email.from || "")}
Snippet: ${String(email.snippet || "")}

Previous draft:
${String(previousDraft || "")}

User instruction (intent to reflect, not verbatim text):
${String(instruction || "")}

Guidelines:
- Keep it first-person singular (“I”).
- Be direct and friendly.
- 2-5 sentences maximum unless needed.
- Do NOT say you are an AI.
- Replace the previous stance with the instruction.
- Output only the final reply text, nothing else.`;
  const result = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return String(result.text || "").trim();
}

// Compose a brand-new email from a short user message.
// Returns a concise subject and a polished body (2-5 sentences).
export async function composeNewEmailDraft(params: {
  to: string;
  message: string;
  tone?: "professional" | "casual" | "friendly" | "direct";
}): Promise<{ subject: string; body: string }> {
  const { to, message, tone } = params;
  const prompt = `Compose a new email to the recipient below.

Recipient: ${to}
User message/intention: ${String(message || "")}

Tone: ${tone || "professional"}
Rules:
- Generate a clear subject (<= 8 words).
- Body: 3-6 sentences, first-person singular (“I”), friendly and professional.
- Do NOT add signatures or sign-offs (e.g., Best, Regards) and do NOT include placeholders like [Your Name].
- Do NOT mention being an AI.
- Output STRICT JSON only: {"subject":"...","body":"..."} with no extra text.`;
  const result = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  const raw = String(result.text || "").trim();
  // Attempt to extract JSON even if fenced
  const jsonText = (() => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return raw.slice(start, end + 1);
    return raw;
  })();
  try {
    const obj = JSON.parse(jsonText);
    let subject = String(obj?.subject || "").trim();
    let body = String(obj?.body || "").trim();
    // Sanitize placeholders and signatures
    const placeholderRe = /\[(?:your\s+name|name)\]/gi;
    body = body.replace(placeholderRe, "").replace(/\s{2,}/g, " ").trim();
    // Strip common sign-offs and orphan name lines
    body = body.replace(/\n(?:best|regards|thanks|thank you|sincerely)[,]?\s*\n.*$/gim, "");
    if (!subject) subject = "No Subject";
    if (!body) body = message || "";
    return { subject, body };
  } catch {
    // Fallback: minimal formatting if JSON parsing fails
    const subject = "No Subject";
    const body = message || "";
    return { subject, body };
  }
}


