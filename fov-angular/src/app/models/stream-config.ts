export type StreamVisibility = 'public' | 'unlisted' | 'private';

export interface StreamSettings {
  streamId: string;
  title: string;
  description: string;
  visibility: StreamVisibility;
  thumbnailUrl: string;
  categoryId: number | null;
  category: string;
  streamKey: string;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateStreamSettings {
  title?: string;
  description?: string;
  visibility?: StreamVisibility;
  thumbnailUrl?: string;
  categoryId?: number | null;
}

export interface StreamKeyResponse {
  streamKey: string;
  streamId: string;
  isLive: boolean;
  updatedAt: string;
}

export interface BackendCategory {
  id: number;
  name: string;
  viewers: number;
  image_url: string;
}

export interface ApiValidationErrorResponse {
  errors: Record<string, string>;
}
