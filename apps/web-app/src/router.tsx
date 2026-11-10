import * as React from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { AppShell } from '@/components/layout/app-shell';
import { RbacRouteGuard } from '@/components/layout/rbac-route-guard';

const LazyLoginPage = React.lazy(async () => {
  const mod = await import('@/features/profile');
  return { default: mod.LoginPage };
});

const LazyProfilePage = React.lazy(async () => {
  const mod = await import('@/features/profile');
  return { default: mod.ProfilePage };
});

const LazyQrOrderPage = React.lazy(async () => {
  const mod = await import('@/features/qr-order');
  return { default: mod.QrOrderPage };
});

const LazyPosUnifiedPage = React.lazy(async () => {
  const mod = await import('@/features/pos-counter');
  return { default: mod.PosUnifiedPage };
});

const LazyInvoicesPage = React.lazy(async () => {
  const mod = await import('@/features/invoices');
  return { default: mod.InvoicesPage };
});

const LazyInventoryPage = React.lazy(async () => {
  const mod = await import('@/features/inventory');
  return { default: mod.InventoryPage };
});

const LazyCashflowPage = React.lazy(async () => {
  const mod = await import('@/features/cashflow');
  return { default: mod.CashflowPage };
});

const LazyEmployeesPage = React.lazy(async () => {
  const mod = await import('@/features/employees');
  return { default: mod.EmployeesPage };
});

const LazySchedulesMatrixPage = React.lazy(async () => {
  const mod = await import('@/features/schedules');
  return { default: mod.SchedulesMatrixPage };
});

const LazyMasterDataPage = React.lazy(async () => {
  const mod = await import('@/features/master-data');
  return { default: mod.MasterDataPage };
});

const LazyMenuManagementPage = React.lazy(async () => {
  const mod = await import('@/features/menu');
  return { default: mod.MenuManagementPage };
});

const LazyRbacUsersPage = React.lazy(async () => {
  const mod = await import('@/features/rbac');
  return { default: mod.RbacUsersPage };
});

export const appRoutes: RouteObject[] = [
  {
    path: '/qr/:token',
    element: (
      <React.Suspense fallback={<div className="p-6 text-sm">Đang tải thực đơn QR...</div>}>
        <LazyQrOrderPage />
      </React.Suspense>
    ),
  },
  {
    path: '/login',
    element: (
      <React.Suspense fallback={<div className="p-6 text-sm">Đang tải màn hình đăng nhập...</div>}>
        <LazyLoginPage />
      </React.Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <RbacRouteGuard>
        <AppShell />
      </RbacRouteGuard>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/pos" replace />,
      },
      {
        path: 'pos',
        element: (
          <RbacRouteGuard module="pos">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải màn hình POS...</div>}>
              <LazyPosUnifiedPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'menu',
        element: (
          <RbacRouteGuard module="pos">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải quản trị thực đơn...</div>}>
              <LazyMenuManagementPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'invoices',
        element: (
          <RbacRouteGuard module="invoices">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải danh sách hoá đơn...</div>}>
              <LazyInvoicesPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'inventory',
        element: (
          <RbacRouteGuard module="inventory">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải quản lý nhập hàng...</div>}>
              <LazyInventoryPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'cashflow',
        element: (
          <RbacRouteGuard module="cashflow">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải dòng tiền kết ca...</div>}>
              <LazyCashflowPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'employees',
        element: (
          <RbacRouteGuard module="employees">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải quản lý nhân sự...</div>}>
              <LazyEmployeesPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'schedules',
        element: (
          <RbacRouteGuard module="schedules">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải lịch làm việc...</div>}>
              <LazySchedulesMatrixPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'master-data',
        element: (
          <RbacRouteGuard module="mdm">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải quản trị danh mục...</div>}>
              <LazyMasterDataPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'rbac',
        element: (
          <RbacRouteGuard module="rbac">
            <React.Suspense fallback={<div className="p-6 text-sm">Đang tải phân quyền...</div>}>
              <LazyRbacUsersPage />
            </React.Suspense>
          </RbacRouteGuard>
        ),
      },
      {
        path: 'profile',
        element: (
          <React.Suspense fallback={<div className="p-6 text-sm">Đang tải hồ sơ...</div>}>
            <LazyProfilePage />
          </React.Suspense>
        ),
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}
