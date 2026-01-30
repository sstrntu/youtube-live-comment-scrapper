// Client-side storage utilities for API key management

const API_KEY_STORAGE_KEY = 'youtube_scraper_api_key';

export const saveApiKey = (key: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  }
};

export const getApiKey = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  }
  return null;
};

export const clearApiKey = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
};
