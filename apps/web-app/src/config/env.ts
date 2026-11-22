import { z } from 'zod';

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().trim().min(1).default('http://localhost:3000'),
  VITE_SOCKET_URL: z.string().trim().min(1).default('http://localhost:3000'),
});

const getDynamicApiUrl = () => {
  const envUrl = import.meta.env?.VITE_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};

const getDynamicSocketUrl = () => {
  const envUrl = import.meta.env?.VITE_SOCKET_URL?.trim();
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};

const rawEnv = {
  VITE_API_BASE_URL: getDynamicApiUrl(),
  VITE_SOCKET_URL: getDynamicSocketUrl(),
};

export const env = EnvSchema.parse(rawEnv);
