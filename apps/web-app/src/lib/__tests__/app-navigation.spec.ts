import { UserPermissionsSchema } from '@fnb/shared';
import { describe, expect, it } from 'vitest';

import {
  APP_NAVIGATION_GROUPS,
  APP_NAVIGATION_ROUTE_MAP,
  APP_NAVIGATION_ROUTES,
  buildOrderedNavigationSections,
  canUserAccessRoute,
  getAccessibleRoutes,
} from '@/lib/app-navigation';
import type { AuthenticatedUser } from '@/stores/auth.store';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    employeeId: 1,
    username: 'staff',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({}),
    ...overrides,
  };
}

describe('app-navigation registry & RBAC filtering', () => {
  it('keeps APP_NAVIGATION_ROUTE_MAP in 1-to-1 sync with APP_NAVIGATION_ROUTES', () => {
    expect(APP_NAVIGATION_ROUTE_MAP.size).toBe(APP_NAVIGATION_ROUTES.length);
    for (const route of APP_NAVIGATION_ROUTES) {
      expect(APP_NAVIGATION_ROUTE_MAP.get(route.path)).toBe(route);
    }
  });

  it('denies all routes for null user and grants all routes to superadmin', () => {
    const posRoute = APP_NAVIGATION_ROUTE_MAP.get('/pos')!;
    const profileRoute = APP_NAVIGATION_ROUTE_MAP.get('/profile')!;

    expect(canUserAccessRoute(null, posRoute)).toBe(false);
    expect(canUserAccessRoute(null, profileRoute)).toBe(false);
    expect(getAccessibleRoutes(null)).toEqual([]);

    const superadmin = makeUser({ isSuperAdmin: true });
    expect(getAccessibleRoutes(superadmin).length).toBe(APP_NAVIGATION_ROUTES.length);
  });

  it('allows module-less routes like /profile for any authenticated user and filters module routes strictly by view permission', () => {
    const cashier = makeUser({
      permissions: UserPermissionsSchema.parse({
        dashboard: { view: false },
        pos: { view: true, create: true },
        menu: { view: false },
        invoices: { view: true },
        rbac: { view: false },
      }),
    });

    const paths = getAccessibleRoutes(cashier).map((r) => r.path);
    expect(paths).toContain('/pos');
    expect(paths).toContain('/invoices');
    expect(paths).toContain('/profile');
    expect(paths).not.toContain('/rbac');
    expect(paths).not.toContain('/settings');
    expect(paths).not.toContain('/dashboard');
  });

  it('orders groups and items using store overrides and drops groups with no accessible routes', () => {
    const financeOnlyUser = makeUser({
      permissions: UserPermissionsSchema.parse({
        cashflow: { view: true },
        inventory: { view: true },
        employees: { view: true },
      }),
    });
    const accessible = getAccessibleRoutes(financeOnlyUser);
    const sections = buildOrderedNavigationSections(accessible, {
      navGroupOrder: ['hr', 'finance', 'sales'],
      navGroupLabels: { hr: 'Nhân sự Quán' },
      navOrder: ['/inventory', '/cashflow'],
    });

    expect(sections.map((s) => s.key)).toEqual(['hr', 'finance']);
    expect(sections[0]!.label).toBe('Nhân sự Quán');
    expect(sections[0]!.defaultLabel).toBe(
      APP_NAVIGATION_GROUPS.find((g) => g.key === 'hr')!.label,
    );
    expect(sections[1]!.items.map((r) => r.path)).toEqual(['/inventory', '/cashflow']);
  });
});
