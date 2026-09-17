// Frontend-side mirror of AiAssistantController's chat contract (see
// apps/api/src/modules/ai-assistant/ai-assistant.controller.ts and
// dto/chat.dto.ts).

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  configured: boolean;
  reply: string;
}
