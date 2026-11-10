import { z } from 'zod';

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().trim().min(1).default('http://localhost:3000'),
  VITE_SOCKET_URL: z.string().trim().min(1).default('http://localhost:3000'),
});

const getDynamicApiUrl = () => {
  const envUrl = import.meta.env?.VITE_API_BASE_URL;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `${window.location.protocol}//${host}:3000`;
    }
  }
  return envUrl || 'http://localhost:3000';
};

const getDynamicSocketUrl = () => {
  const envUrl = import.meta.env?.VITE_SOCKET_URL;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `${window.location.protocol}//${host}:3000`;
    }
  }
  return envUrl || 'http://localhost:3000';
};

const rawEnv = {
  VITE_API_BASE_URL: getDynamicApiUrl(),
  VITE_SOCKET_URL: getDynamicSocketUrl(),
};

export const env = EnvSchema.parse(rawEnv);
