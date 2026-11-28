import { fileURLToPath } from 'node:url';
import webConfig from '../../../apps/web-app/vite.config.ts';

const root = fileURLToPath(new URL('../../../apps/web-app/', import.meta.url));
const test = fileURLToPath(new URL('./transport.audit.test.tsx', import.meta.url));

export default {
  ...webConfig,
  root,
  resolve: {
    ...webConfig.resolve,
    alias: {
      ...webConfig.resolve!.alias,
      ...Object.fromEntries(['react', '@fnb/shared', '@tanstack/react-query', '@testing-library/react'].map((name) => [name, fileURLToPath(new URL(`../../../apps/web-app/node_modules/${name}`, import.meta.url))])),
    },
  },
  test: { ...webConfig.test, include: [test], coverage: { enabled: false } },
};
