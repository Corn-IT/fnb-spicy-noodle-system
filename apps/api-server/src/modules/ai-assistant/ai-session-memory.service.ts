import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { AiChatTurn, AiPersonaProfile } from '@fnb/shared';

export interface AiSessionState {
  readonly key: string;
  readonly userId: number;
  turns: AiChatTurn[];
  slots: Record<string, string | number>;
  persona: AiPersonaProfile;
  updatedAt: number;
}

export interface MissedIntentCluster {
  readonly norm: string;
  readonly sample: string;
  readonly count: number;
  readonly lastSeenAt: string;
}

const ACTIVE_SESSION_STORES = new Set<AiSessionMemoryService>();

/** Invoked on /api/v1/auth/logout without creating a NestJS circular dependency. */
export function clearAiSessionsForUser(userId: number): void {
  for (const store of ACTIVE_SESSION_STORES) {
    store.clearAllForUser(userId);
  }
}

@Injectable()
export class AiSessionMemoryService implements OnModuleDestroy {
  private static readonly SESSION_TTL_MS = 15 * 60 * 1000;
  private static readonly MAX_SESSIONS = 200;
  private static readonly MAX_TURNS = 8;
  private static readonly MAX_MISSED_CLUSTERS = 100;

  private readonly sessions = new Map<string, AiSessionState>();
  private readonly missedClusters = new Map<
    string,
    { norm: string; sample: string; count: number; lastSeenAt: string }
  >();

  constructor() {
    ACTIVE_SESSION_STORES.add(this);
  }

  onModuleDestroy(): void {
    ACTIVE_SESSION_STORES.delete(this);
  }

  private buildKey(userId: number, clientSessionId?: string): string {
    const cleanSid = clientSessionId?.trim() || 'default';
    return `${userId}:${cleanSid}`;
  }

  private pruneExpired(nowMs: number): void {
    for (const [k, state] of this.sessions.entries()) {
      if (nowMs - state.updatedAt > AiSessionMemoryService.SESSION_TTL_MS) {
        this.sessions.delete(k);
      }
    }
  }

  getSession(userId: number, clientSessionId?: string, nowMs = Date.now()): AiSessionState | null {
    this.pruneExpired(nowMs);
    const key = this.buildKey(userId, clientSessionId);
    return this.sessions.get(key) ?? null;
  }

  appendInteraction(
    userId: number,
    clientSessionId: string | undefined,
    params: {
      userText: string;
      assistantText: string;
      route: AiChatTurn['route'];
      intentId?: string | null;
      tokensUsed: number;
      latencyMs: number;
      modelUsed?: string | null;
      persona: AiPersonaProfile;
      slots?: Record<string, string | number | null | undefined>;
    },
    nowMs = Date.now(),
  ): AiSessionState {
    this.pruneExpired(nowMs);
    const key = this.buildKey(userId, clientSessionId);
    const existing = this.sessions.get(key);
    const mergedSlots: Record<string, string | number> = existing ? { ...existing.slots } : {};

    if (params.slots) {
      for (const [slotKey, val] of Object.entries(params.slots)) {
        if (val === null || val === undefined || val === '') {
          delete mergedSlots[slotKey];
        } else {
          mergedSlots[slotKey] = val;
        }
      }
    }

    const isoNow = new Date(nowMs).toISOString();
    const userTurn: AiChatTurn = {
      id: `u-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      text: params.userText.slice(0, 1000),
      tokensUsed: 0,
      timestamp: isoNow,
    };
    const assistantTurn: AiChatTurn = {
      id: `a-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      text: params.assistantText.slice(0, 6000),
      route: params.route,
      intentId: params.intentId ?? null,
      tokensUsed: Math.max(0, params.tokensUsed),
      latencyMs: Math.max(0, params.latencyMs),
      modelUsed: params.modelUsed ?? null,
      timestamp: isoNow,
    };
    const nextTurns: AiChatTurn[] = [
      ...(existing?.turns ?? []),
      userTurn,
      assistantTurn,
    ].slice(-AiSessionMemoryService.MAX_TURNS * 2);

    const nextState: AiSessionState = {
      key,
      userId,
      turns: nextTurns,
      slots: mergedSlots,
      persona: params.persona,
      updatedAt: nowMs,
    };

    // Re-insert so Map maintains LRU recency order and stays bounded to MAX_SESSIONS
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
    }
    this.sessions.set(key, nextState);
    while (this.sessions.size > AiSessionMemoryService.MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
    return nextState;
  }

  clearSession(userId: number, clientSessionId?: string): boolean {
    if (!clientSessionId) {
      return this.clearAllForUser(userId) > 0;
    }
    return this.sessions.delete(this.buildKey(userId, clientSessionId));
  }

  clearAllForUser(userId: number): number {
    let removed = 0;
    const prefix = `${userId}:`;
    for (const key of this.sessions.keys()) {
      if (key.startsWith(prefix)) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  recordMissedIntent(normQuery: string, rawSample: string, nowMs = Date.now()): void {
    const norm = normQuery.trim();
    if (!norm || norm.length < 4) return;
    const prev = this.missedClusters.get(norm);
    const iso = new Date(nowMs).toISOString();
    if (prev) {
      this.missedClusters.delete(norm);
      this.missedClusters.set(norm, {
        norm,
        sample: rawSample.trim().slice(0, 160),
        count: prev.count + 1,
        lastSeenAt: iso,
      });
    } else {
      this.missedClusters.set(norm, {
        norm,
        sample: rawSample.trim().slice(0, 160),
        count: 1,
        lastSeenAt: iso,
      });
      while (this.missedClusters.size > AiSessionMemoryService.MAX_MISSED_CLUSTERS) {
        const oldest = this.missedClusters.keys().next().value;
        if (!oldest) break;
        this.missedClusters.delete(oldest);
      }
    }
  }

  getMissedIntentClusters(limit = 10): MissedIntentCluster[] {
    return [...this.missedClusters.values()]
      .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, Math.max(1, limit));
  }
}
