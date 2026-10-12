import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ connected: false, connect: vi.fn(), disconnect: vi.fn() })),
}));

describe('getSocket (singleton)', () => {
  const savedEnv = process.env.NEXT_PUBLIC_SOCKET_URL;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SOCKET_URL;
    else process.env.NEXT_PUBLIC_SOCKET_URL = savedEnv;
  });

  async function load() {
    const { io } = await import('socket.io-client');
    const mod = await import('../../src/lib/socket');
    return { io: vi.mocked(io), getSocket: mod.getSocket };
  }

  it('crée le socket une seule fois avec l’URL et les options attendues', async () => {
    const { io, getSocket } = await load();
    const a = getSocket('http://a:3001');
    const b = getSocket('http://a:3001');
    expect(a).toBe(b);
    expect(io).toHaveBeenCalledTimes(1);
    expect(io.mock.calls[0][0]).toBe('http://a:3001');
    expect(io.mock.calls[0][1]).toEqual({
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 10000,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('avertit si une autre URL est demandée après la création', async () => {
    const { io, getSocket } = await load();
    getSocket('http://a:3001');
    getSocket('http://b:3001');
    expect(io).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain('http://b:3001');
    expect(msg).toContain('http://a:3001');
  });

  it('sans argument : repli sur NEXT_PUBLIC_SOCKET_URL (hors navigateur)', async () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = 'http://build.test:3001';
    const { io, getSocket } = await load();
    getSocket();
    expect(io.mock.calls[0][0]).toBe('http://build.test:3001');
  });

  it('sans argument ni valeur de build : http://localhost:3001', async () => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    const { io, getSocket } = await load();
    getSocket();
    expect(io.mock.calls[0][0]).toBe('http://localhost:3001');
  });
});
