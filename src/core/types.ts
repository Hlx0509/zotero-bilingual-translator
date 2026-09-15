export interface TranslationSettings {
  apiKey: string;
  model: string;
  targetLanguage: 'zh-CN';
  maxChunkCharacters: number;
}

export interface PluginRuntime {
  registerMenu(): void;
  registerPreferences(): void;
  shutdown(): void;
}

export interface TranslationChunk {
  id: string;
  paragraphs: string[];
  source: string;
}

export interface CacheKeyInput {
  documentFingerprint: string;
  source: string;
  model: string;
  targetLanguage: string;
}
