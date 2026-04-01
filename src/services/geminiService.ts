import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function transcribeImageOrPdf(base64Data: string, mimeType: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: "Please transcribe the text from this file accurately. If it's a book page, maintain the paragraph structure. Return ONLY the transcribed text.",
          },
        ],
      },
    ],
  });
  return response.text || "No text found.";
}

export async function getWordDefinition(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: [
      {
        parts: [
          {
            text: `Provide a concise definition and a simple example sentence for the following text: "${text}". If it's a single word, give its dictionary definition. If it's a phrase, explain its meaning in context. Format as: "Meaning: ... \nExample: ..."`,
          },
        ],
      },
    ],
  });
  return response.text || "Information not available.";
}

export async function explainComplexText(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            text: `Explain the following text in simple terms, as if explaining to a student. Break down complex concepts if necessary: "${text}"`,
          },
        ],
      },
    ],
  });
  return response.text || "Explanation not available.";
}

export async function transcribeAudio(base64Data: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: "audio/wav",
            },
          },
          {
            text: "Please transcribe this audio accurately.",
          },
        ],
      },
    ],
  });
  return response.text || "No transcription found.";
}

export async function generateCoverImage(prompt: string, aspectRatio: string = "1:1"): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ text: `Create a high-quality, artistic audiobook cover for: ${prompt}` }],
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return "";
}

export async function generateSpeech(text: string, voiceName: string = "Kore"): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio || "";
}
