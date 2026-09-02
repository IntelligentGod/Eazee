export const summarizeContentPrompt = (selectedContent: string) => `
  Summarize the following content based on the user's speech text in a concise way while still keeping all the details. It should be relatively shorter.

  content:
  ${selectedContent}   

  Return only the summary, and nothing else. It should be considerably smaller.
`;

// export const determineRequestTypePrompt = (speechText: string) => `
//   Choose what type of request the user is asking for, return only one number. The output should only contain the number and nothing else. Use logical reasoning to choose the most appropriate one. For any text formatting, choose 2. Custom Request.
//   1. Image Generation
//   2. Custom Request
//   3. Summary ${speechText}
//   4. Data/Information on a topic
// `;

export const determineRequestTypePrompt = (speechText: string) => `Choose what type of request the user is asking for, return only one number. The output should only contain the number and nothing else. Use logical reasoning to choose the most appropriate one.

1. Image Generation: If the user is asking to create, generate, or produce an image.
2. Custom Request: For text formatting or any other editing requests (e.g., make text bold, create a table).
3. Summary: If the user is asking for a summary of the content.
4. Data/Information: If the user is asking for more information about the existing content or any topic in general.

User's request: "${speechText}"

Return only the number (1, 2, 3, or 4) that best matches the request.`;

export const summarizeHtmlContentPrompt = (html: string, speechText: string) => `
  Summarize the following HTML content based on the user's speech text in a concise way while still keeping all the details. It should be relatively shorter.

  HTML content:
  ${html}

  User's speech text: "${speechText}"

  Return a JSON object with the following format:
  {
    "summary": "The generated summary",
    "type": "full" if the entire note is summarized, or "paragraph" if a specific paragraph is summarized
  }
`;

export const customRequestPrompt = (functionName: string, html: string, speechText: string) => {
  switch (functionName) {
    case "bold":
      return `Make the following text bold: "${html}". If the user specified a specific word, sentence, or paragraph, only make that part bold. Return only the html content and nothing else, do not include \`\`\`html\`\`\`. It should be added on to the original html. User's speech: "${speechText}"`;
    case "italic":
      return `Make the following text italic: "${html}". If the user specified a specific word, sentence, or paragraph, only make that part italic. Return only the html content and nothing else, do not include \`\`\`html\`\`\`. User's speech: "${speechText}"`;
    case "underline":
      return `Underline the following text: "${html}". If the user specified a specific word, sentence, or paragraph, only underline that part. Return only the html content and nothing else, do not include \`\`\`html\`\`\`. User's speech: "${speechText}"`;
    case "table":
      return `Create a table using the relevant data from the following html content: "${html}". Only replace the relevant part with the table, while keeping the other html content, do not include \`\`\`html\`\`\`. Do not return any helpful or extra message. User's speech: "${speechText}"`;
    default:
      throw new Error("Unknown function name");
  }
};