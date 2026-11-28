import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCodes,
  checkGuardrailBlock,
  detectAddressingMode,
  detectSystemDocQuestion,
  matchSemanticIntent,
  type AiActiveEngines,
  type AiChatRequest,
  type AiChatResponse,
  type AiPersonaProfile,
  type AiStatusResponse,
  type AuthPrincipal,
} from '@fnb/shared';
import { StoreSettingsService } from '../store-settings/store-settings.service';
import { AiSessionMemoryService } from './ai-session-memory.service';
import { GeminiMultiPoolService } from './gemini-multipool.service';
import { LocalAiEngineService } from './local-ai-engine.service';
import { RbacToolPolicyService } from './rbac-tool-policy.service';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    @Inject(StoreSettingsService) private readonly storeSettingsService: StoreSettingsService,
    @Inject(AiSessionMemoryService) private readonly sessionMemory: AiSessionMemoryService,
    @Inject(LocalAiEngineService) private readonly localEngine: LocalAiEngineService,
    @Inject(GeminiMultiPoolService) private readonly geminiPool: GeminiMultiPoolService,
    @Inject(RbacToolPolicyService) private readonly rbacPolicy: RbacToolPolicyService,
  ) {}

  private buildModeSummary(engines: AiActiveEngines): string {
    if (!engines.enabled) return 'Đang tạm tắt bởi Quản trị viên';
    if (engines.localEnabled && engines.geminiEnabled) return '⚡ Local 0-token + 🤖 Gemini AI';
    if (engines.localEnabled) return '⚡ Chỉ AI Local (0 token)';
    if (engines.geminiEnabled) return '🤖 Chỉ AI Gemini';
    return '⚠️ Cả 2 động cơ AI đang tạm tắt';
  }

  private buildGreeting(engines: AiActiveEngines, persona: AiPersonaProfile): string {
    if (!engines.enabled) {
      return 'Tính năng Trợ lý AI Lona hiện đang tạm tắt bởi Quản trị viên.';
    }
    if (!engines.localEnabled && !engines.geminiEnabled) {
      return 'Cả 2 động cơ AI Local và Gemini hiện đang tạm tắt trong Cài đặt.';
    }
    return `Dạ ${persona.botSelf} là Lona AI — ${persona.userCall} cần tra số liệu hay cách dùng POS cứ hỏi ${persona.botSelf} nhé ạ!`;
  }

  async getStatus(principal: AuthPrincipal, clientSessionId?: string): Promise<AiStatusResponse> {
    const settings = await this.storeSettingsService.getPublicSettings();
    const activeEngines: AiActiveEngines = settings.aiAssistant;
    const quotaStatus = this.geminiPool.getQuotaStatus(principal);
    const session = this.sessionMemory.getSession(principal.id, clientSessionId);
    const persona = session?.persona ?? detectAddressingMode('');

    return {
      activeEngines,
      modeSummary: this.buildModeSummary(activeEngines),
      canChat: activeEngines.enabled && (activeEngines.localEnabled || activeEngines.geminiEnabled),
      quotaStatus,
      suggestions: activeEngines.enabled
        ? this.rbacPolicy.getSuggestionChips(principal, activeEngines.geminiEnabled)
        : [],
      greeting: this.buildGreeting(activeEngines, persona),
      sessionTurnCount: Math.floor((session?.turns.length ?? 0) / 2),
      isSuperAdmin: principal.isSuperAdmin,
    };
  }

  async resetSession(principal: AuthPrincipal, clientSessionId?: string): Promise<{ cleared: boolean }> {
    const cleared = this.sessionMemory.clearSession(principal.id, clientSessionId);
    return { cleared };
  }

  async chat(input: AiChatRequest, principal: AuthPrincipal, now = new Date()): Promise<AiChatResponse> {
    const t0 = Date.now();
    const settings = await this.storeSettingsService.getPublicSettings();
    const activeEngines: AiActiveEngines = settings.aiAssistant;

    if (!activeEngines.enabled) {
      throw new ForbiddenException({
        code: ErrorCodes.AI_ASSISTANT_DISABLED,
        message: 'Tính năng Trợ lý AI Lona hiện đang tạm tắt bởi Quản trị viên.',
      });
    }

    const existingSession = this.sessionMemory.getSession(principal.id, input.clientSessionId, now.getTime());
    const persona = detectAddressingMode(input.message, input.personaHint);
    const quotaBefore = this.geminiPool.getQuotaStatus(principal, now);
    const suggestions = this.rbacPolicy.getSuggestionChips(principal, activeEngines.geminiEnabled);

    if (!activeEngines.localEnabled && !activeEngines.geminiEnabled) {
      return {
        reply: `Dạ cả hai nhánh AI Local và AI Gemini hiện đều đang tạm tắt trong Cài đặt, ${persona.userCall} bật lại ít nhất một nhánh tại /settings giúp ${persona.botSelf} ạ.`,
        route: 'engine_disabled',
        intentId: null,
        period: null,
        persona,
        tokensUsed: 0,
        latencyMs: Math.max(1, Date.now() - t0),
        nluMissCandidate: false,
        activeEngines,
        quotaStatus: quotaBefore,
        suggestions,
        modelUsed: null,
      };
    }

    // Layer 1: Zero-token Guardrail always protects before Local or Gemini
    const preGuard = checkGuardrailBlock(input.message);
    if (preGuard.blocked) {
      return {
        reply: preGuard.reason ?? `Dạ ${persona.botSelf} chỉ hỗ trợ thông tin vận hành Quán Mì Cay & hệ thống POS ạ.`,
        route: 'guardrail_block',
        intentId: null,
        period: null,
        persona,
        tokensUsed: 0,
        latencyMs: Math.max(1, Date.now() - t0),
        nluMissCandidate: false,
        activeEngines,
        quotaStatus: quotaBefore,
        suggestions,
        modelUsed: null,
      };
    }

    // Layer 2: Local NLU & System KB Engine (when enabled)
    if (activeEngines.localEnabled) {
      const localRes = await this.localEngine.tryAnswerLocally({
        message: input.message,
        principal,
        persona,
        slots: existingSession?.slots,
        now,
      });

      if (localRes.handled && localRes.reply && localRes.route) {
        const latencyMs = Math.max(1, Date.now() - t0);
        this.logger.log(
          `AI chat route=${localRes.route} intent=${localRes.intentId ?? 'meta'} entities=[${localRes.match?.entities.join(',') ?? ''}] tokens=0 miss=false ms=${latencyMs}`,
        );
        this.sessionMemory.appendInteraction(
          principal.id,
          input.clientSessionId,
          {
            userText: input.message,
            assistantText: localRes.reply,
            route: localRes.route,
            intentId: localRes.intentId ?? null,
            tokensUsed: 0,
            latencyMs,
            persona,
            slots: localRes.updatedSlots,
          },
          now.getTime(),
        );
        return {
          reply: localRes.reply,
          route: localRes.route,
          intentId: localRes.intentId ?? null,
          period: localRes.period ?? null,
          persona,
          tokensUsed: 0,
          latencyMs,
          nluMissCandidate: false,
          activeEngines,
          quotaStatus: quotaBefore,
          suggestions,
          modelUsed: null,
        };
      }
    }

    const semCheck = matchSemanticIntent(input.message);
    const isMissCandidate = !semCheck.guardBlocked && !detectSystemDocQuestion(semCheck.normText);

    // Local-only mode: do not call Gemini API when geminiEnabled === false
    if (!activeEngines.geminiEnabled) {
      if (isMissCandidate) {
        this.sessionMemory.recordMissedIntent(semCheck.normText, input.message, now.getTime());
      }
      const latencyMs = Math.max(1, Date.now() - t0);
      this.logger.log(
        `AI chat route=engine_disabled intent=none guard=${semCheck.guardId ?? 'none'} entities=[${semCheck.entities.join(',')}] metrics=[${semCheck.metrics.join(',')}] miss=${isMissCandidate} len=${semCheck.normText.length} ms=${latencyMs}`,
      );
      const topExamples = suggestions
        .slice(0, 3)
        .map((s) => `• "${s.prompt}"`)
        .join('\n');
      return {
        reply:
          `Dạ nhánh AI Gemini hiện đang tạm tắt nên ${persona.botSelf} chỉ xử lý các tra cứu cục bộ 0-token (món bán chạy/chậm, giờ cao điểm, doanh thu, bàn trống, két tiền, hóa đơn, nhân sự, hướng dẫn POS).` +
          (topExamples ? `\n${persona.userCall} thử hỏi trực tiếp theo gợi ý:\n${topExamples}` : ''),
        route: 'engine_disabled',
        intentId: null,
        period: semCheck.period,
        persona,
        tokensUsed: 0,
        latencyMs,
        nluMissCandidate: isMissCandidate,
        activeEngines,
        quotaStatus: quotaBefore,
        suggestions,
        modelUsed: null,
      };
    }

    // Layer 3: Gemini Multi-Pool with RBAC-scoped tools
    const aiRes = await this.geminiPool.generateReply({
      question: input.message,
      principal,
      persona,
      history: existingSession?.turns,
      now,
    });
    const latencyMs = Math.max(1, Date.now() - t0);
    const route = aiRes.guardrailBlocked ? 'guardrail_block' : 'gemini';
    this.logger.log(
      `AI chat route=${route} model=${aiRes.modelUsed ?? 'none'} tokens=${aiRes.tokensUsed} miss=${isMissCandidate && !aiRes.guardrailBlocked} guard=${semCheck.guardId ?? 'none'} ms=${latencyMs}`,
    );

    if (isMissCandidate && !aiRes.guardrailBlocked) {
      this.sessionMemory.recordMissedIntent(semCheck.normText, input.message, now.getTime());
    }

    if (!aiRes.guardrailBlocked) {
      this.sessionMemory.appendInteraction(
        principal.id,
        input.clientSessionId,
        {
          userText: input.message,
          assistantText: aiRes.reply,
          route,
          intentId: null,
          tokensUsed: aiRes.tokensUsed,
          latencyMs,
          modelUsed: aiRes.modelUsed,
          persona,
        },
        now.getTime(),
      );
    }

    return {
      reply: aiRes.reply,
      route,
      intentId: null,
      period: semCheck.period,
      persona,
      tokensUsed: aiRes.tokensUsed,
      latencyMs,
      nluMissCandidate: isMissCandidate && !aiRes.guardrailBlocked,
      activeEngines,
      quotaStatus: this.geminiPool.getQuotaStatus(principal, now),
      suggestions,
      modelUsed: aiRes.modelUsed,
    };
  }
}
