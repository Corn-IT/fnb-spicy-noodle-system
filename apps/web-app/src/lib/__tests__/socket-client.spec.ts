import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectPosSocket,
  disconnectPosSocket,
  getPosSocket,
} from '@/lib/socket-client';

const ioState = vi.hoisted(() => {
  const created: Array<{
    url: string;
    opts: Record<string, unknown>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const ioMock = vi.fn((url: string, opts: Record<string, unknown>) => {
    const inst = { url, opts, disconnect: vi.fn() };
    created.push(inst);
    return inst;
  });
  return { created, ioMock };
});

vi.mock('socket.io-client', () => ({
  io: ioState.ioMock,
}));

describe('socket-client', () => {
  beforeEach(() => {
    ioState.created.length = 0;
    ioState.ioMock.mockClear();
    disconnectPosSocket();
  });

  it('connects and replaces staff socket, evaluates auth callback, and queries getPosSocket', () => {
    expect(getPosSocket()).toBeNull();
    expect(getPosSocket('staff')).toBeNull();
    expect(getPosSocket('qr_guest')).toBeNull();

    let latestToken: string | null = 'tok-1';
    const first = connectPosSocket({
      mode: 'staff',
      token: 'fallback-tok',
      getToken: () => latestToken,
    });
    expect(getPosSocket('staff')).toBe(first);
    expect(getPosSocket()).toBe(first);

    const authCb = ioState.created[0]?.opts.auth as (cb: (data: Record<string, unknown>) => void) => void;
    const received: Record<string, unknown>[] = [];
    authCb((d) => received.push(d));
    latestToken = null;
    authCb((d) => received.push(d));
    expect(received).toEqual([{ token: 'tok-1' }, { token: 'fallback-tok' }]);

    const second = connectPosSocket({ mode: 'staff', token: 'tok-2' });
    expect((first as unknown as { disconnect: ReturnType<typeof vi.fn> }).disconnect).toHaveBeenCalledTimes(1);
    expect(getPosSocket('staff')).toBe(second);

    disconnectPosSocket('staff');
    expect(getPosSocket('staff')).toBeNull();
  });

  it('connects and cleans up qr_guest socket with orderId and guestSessionToken', () => {
    const guest1 = connectPosSocket({
      mode: 'qr_guest',
      qrToken: 'ban01-tok',
      orderId: 88,
      guestSessionToken: 'g-secret',
    });
    expect(ioState.created[0]?.opts.auth).toEqual({
      qrToken: 'ban01-tok',
      orderId: 88,
      guestSessionToken: 'g-secret',
    });
    expect(getPosSocket('qr_guest')).toBe(guest1);

    const guest2 = connectPosSocket({ mode: 'qr_guest', qrToken: 'mangve-tok' });
    expect((guest1 as unknown as { disconnect: ReturnType<typeof vi.fn> }).disconnect).toHaveBeenCalledTimes(1);
    expect(ioState.created[1]?.opts.auth).toEqual({ qrToken: 'mangve-tok' });
    expect(getPosSocket('qr_guest')).toBe(guest2);

    disconnectPosSocket('qr_guest');
    expect(getPosSocket('qr_guest')).toBeNull();
  });
});
