import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientMeta } from '../security/client-info.util';

export interface RequestContextData extends ClientMeta {
  requestId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

export function runWithRequestContext<T>(data: RequestContextData, fn: () => T): T {
  return requestContextStorage.run(data, fn);
}

export function getRequestContext(): RequestContextData | undefined {
  return requestContextStorage.getStore();
}
