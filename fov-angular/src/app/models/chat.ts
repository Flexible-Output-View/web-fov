export interface ChatMessage {
  id: number | string;
  streamId: string;
  userId: number | string | null;
  username: string;
  message: string;
  createdAt: string;
}

export interface ChatHistoryResponse {
  streamId: string;
  messages: ChatMessage[];
}

export interface SendChatResponse {
  message: ChatMessage;
}
