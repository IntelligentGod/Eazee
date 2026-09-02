export interface Email {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  mimeType: string;
  body: string;
  inlineImages?: { [key: string]: string };
}

export interface EmailWithSummary extends Email {
  summary?: string[];
  date?: string; 
}
