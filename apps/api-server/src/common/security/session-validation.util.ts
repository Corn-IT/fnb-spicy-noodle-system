import { UnauthorizedException } from '@nestjs/common';
import {
  ErrorCodes,
  RevokedSessionNoticeSchema,
  type RevokedSessionNotice,
} from '@fnb/shared';

export interface SessionRecordLike {
  activeSessionId?: string | null;
  lastRevokedNotice?: unknown;
}

export function extractTokenSessionId(payload: { sid?: unknown }): string | null {
  return typeof payload.sid === 'string' && payload.sid.trim().length > 0
    ? payload.sid.trim()
    : null;
}

export function buildRevokedSessionException(rawNotice?: unknown): UnauthorizedException {
  const parsed = RevokedSessionNoticeSchema.safeParse(rawNotice);
  const notice: RevokedSessionNotice | undefined = parsed.success
    ? { reason: parsed.data.reason, at: parsed.data.at }
    : undefined;

  if (notice?.reason === 'NEW_LOGIN') {
    return new UnauthorizedException({
      code: ErrorCodes.AUTH_SESSION_REPLACED,
      message: 'Tài khoản đã đăng nhập trên thiết bị hoặc trình duyệt khác. Phiên trên máy này đã tự động kết thúc.',
      details: notice,
    });
  }

  const reasonMessage =
    notice?.reason === 'PASSWORD_CHANGED'
      ? 'Mật khẩu tài khoản vừa được thay đổi. Vui lòng đăng nhập lại.'
      : notice?.reason === 'ACCOUNT_DISABLED'
        ? 'Tài khoản vừa bị tạm khoá bởi Quản trị viên.'
        : notice?.reason === 'ADMIN_REVOKED'
          ? 'Phiên đăng nhập vừa bị Quản trị viên thu hồi từ xa.'
          : 'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.';

  return new UnauthorizedException({
    code: ErrorCodes.AUTH_SESSION_REVOKED,
    message: reasonMessage,
    ...(notice ? { details: notice } : {}),
  });
}

export function assertActiveSessionMatches(
  user: SessionRecordLike,
  tokenSid: string | null,
): void {
  const hasSessionColumn = 'activeSessionId' in user;
  if (!hasSessionColumn && tokenSid === null) {
    return;
  }

  const dbSid =
    typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
      ? user.activeSessionId.trim()
      : null;

  if (!dbSid || !tokenSid || dbSid !== tokenSid) {
    throw buildRevokedSessionException(user.lastRevokedNotice);
  }
}
