import type { PresetId } from '@mastr/config';

export interface SeoUseCaseConfig {
  slug: string;
  defaultPreset: PresetId;
  targetLufs: number;
  category: string;
  applicationCategory: string;
}

export const SEO_USECASES: Record<string, SeoUseCaseConfig> = {
  'suno-ai': {
    slug: 'suno-ai',
    defaultPreset: 'suno_enhancer',
    targetLufs: -14,
    category: 'AI Audio & Music Generation',
    applicationCategory: 'MultimediaApplication',
  },
  'house-music': {
    slug: 'house-music',
    defaultPreset: 'club_edm',
    targetLufs: -8.5,
    category: 'Electronic Dance Music',
    applicationCategory: 'MultimediaApplication',
  },
  'hip-hop-beats': {
    slug: 'hip-hop-beats',
    defaultPreset: 'auto_ai',
    targetLufs: -9,
    category: 'Hip-Hop & Urban Beats',
    applicationCategory: 'MultimediaApplication',
  },
  'podcasts': {
    slug: 'podcasts',
    defaultPreset: 'streaming_balanced',
    targetLufs: -16,
    category: 'Broadcast & Spoken Word',
    applicationCategory: 'MultimediaApplication',
  },
};

export const ALL_USECASE_SLUGS = Object.keys(SEO_USECASES);
