import { SetMetadata } from '@nestjs/common';

export const AUTHORIZATION_METADATA = 'authorization:requirements';

export type PermissionRequirement = { module: string; action: string };
export type AuthorizationRequirement = PermissionRequirement | { superAdminOnly: true };

export const RequirePermission = (module: string, action: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZATION_METADATA, { module, action } satisfies PermissionRequirement);

export const SuperAdminOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZATION_METADATA, { superAdminOnly: true as const });
