import { z } from 'zod';

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().trim().min(1).default('http://localhost:3000'),
  VITE_SOCKET_URL: z.string().trim().min(1).default('http://localhost:3000'),
});

const rawEnv = {
  VITE_API_BASE_URL: import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000',
  VITE_SOCKET_URL: import.meta.env?.VITE_SOCKET_URL || 'http://localhost:3000',
};

export const env = EnvSchema.parse(rawEnv);
