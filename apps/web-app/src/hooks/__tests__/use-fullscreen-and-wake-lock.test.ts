import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestAppFullscreen, useFullscreen } from '@/hooks/use-fullscreen';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => element,
  });
}

describe('useFullscreen', () => {
  afterEach(() => {
    setFullscreenElement(null);
    vi.restoreAllMocks();
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  });

  it('requests fullscreen on <html> with the Android navigation bar hidden', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: request,
    });

    await expect(requestAppFullscreen()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('reports false instead of throwing when the browser refuses', async () => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('denied')),
    });
    await expect(requestAppFullscreen()).resolves.toBe(false);
  });

  it('tracks fullscreenchange events', () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.isFullscreen).toBe(false);

    act(() => {
      setFullscreenElement(document.documentElement);
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(true);
  });
});

describe('useScreenWakeLock', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('holds a screen wake lock while enabled and releases it on unmount', async () => {
    const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith('screen');

    unmount();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('does nothing when the Wake Lock API is unavailable', () => {
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow();
  });
});
