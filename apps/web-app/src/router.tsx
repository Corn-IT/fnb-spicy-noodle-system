import * as React from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import {
  AppShellRouteErrorElement,
  NotFoundPage,
  RootRouteErrorElement,
} from '@/components/error-display';
import { AppShell } from '@/components/layout/app-shell';
import { RbacRouteGuard } from '@/components/layout/rbac-route-guard';
import { DelayedPageFallback } from '@/components/loading';
import {
  loadCashflowPage,
  loadDashboardPage,
  loadDiscountsPage,
  loadEmployeesPage,
  loadInventoryPage,
  loadInvoicesPage,
  loadLoginPage,
  loadMasterDataPage,
  loadMenuManagementPage,
  loadPaymentQrPage,
  loadPayrollPage,
  loadPosUnifiedPage,
  loadProfilePage,
  loadQrOrderPage,
  loadRbacUsersPage,
  loadSchedulesMatrixPage,
  loadStoreSettingsPage,
} from '@/lib/route-prefetch';

const LazyLoginPage = React.lazy(loadLoginPage);
const LazyProfilePage = React.lazy(loadProfilePage);
const LazyQrOrderPage = React.lazy(loadQrOrderPage);
const LazyDashboardPage = React.lazy(loadDashboardPage);
const LazyPosUnifiedPage = React.lazy(loadPosUnifiedPage);
const LazyInvoicesPage = React.lazy(loadInvoicesPage);
const LazyInventoryPage = React.lazy(loadInventoryPage);
const LazyCashflowPage = React.lazy(loadCashflowPage);
const LazyPaymentQrPage = React.lazy(loadPaymentQrPage);
const LazyDiscountsPage = React.lazy(loadDiscountsPage);
const LazyEmployeesPage = React.lazy(loadEmployeesPage);
const LazySchedulesMatrixPage = React.lazy(loadSchedulesMatrixPage);
const LazyPayrollPage = React.lazy(loadPayrollPage);
const LazyMasterDataPage = React.lazy(loadMasterDataPage);
const LazyMenuManagementPage = React.lazy(loadMenuManagementPage);
const LazyRbacUsersPage = React.lazy(loadRbacUsersPage);
const LazyStoreSettingsPage = React.lazy(loadStoreSettingsPage);

export const appRoutes: RouteObject[] = [
  {
    path: '/q/:token',
    errorElement: <RootRouteErrorElement />,
    element: (
      <React.Suspense
        fallback={<DelayedPageFallback variant="qr" label="Đang tải thực đơn QR..." />}
      >
        <LazyQrOrderPage />
      </React.Suspense>
    ),
  },
  {
    path: '/q',
    errorElement: <RootRouteErrorElement />,
    element: <NotFoundPage variant="guest" />,
  },
  {
    path: '/q/*',
    errorElement: <RootRouteErrorElement />,
    element: <NotFoundPage variant="guest" />,
  },
  {
    path: '/qr/:token',
    errorElement: <RootRouteErrorElement />,
    element: (
      <React.Suspense
        fallback={<DelayedPageFallback variant="qr" label="Đang tải thực đơn QR..." />}
      >
        <LazyQrOrderPage />
      </React.Suspense>
    ),
  },
  {
    path: '/qr',
    errorElement: <RootRouteErrorElement />,
    element: <NotFoundPage variant="guest" />,
  },
  {
    path: '/qr/*',
    errorElement: <RootRouteErrorElement />,
    element: <NotFoundPage variant="guest" />,
  },
  {
    path: '/login',
    errorElement: <RootRouteErrorElement />,
    element: (
      <React.Suspense
        fallback={
          <DelayedPageFallback
            variant="form"
            label="Đang tải màn hình đăng nhập..."
            className="mx-auto max-w-md py-16"
          />
        }
      >
        <LazyLoginPage />
      </React.Suspense>
    ),
  },
  {
    path: '/',
    errorElement: <RootRouteErrorElement />,
    element: (
      <RbacRouteGuard>
        <AppShell />
      </RbacRouteGuard>
    ),
    children: [
      {
        errorElement: <AppShellRouteErrorElement />,
        children: [
          {
            index: true,
            element: <Navigate to="/pos" replace />,
          },
          {
            path: 'dashboard',
            element: (
              <RbacRouteGuard module="dashboard">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback
                      variant="pos"
                      label="Đang tải bảng điều khiển tổng quan..."
                    />
                  }
                >
                  <LazyDashboardPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'pos',
            element: (
              <RbacRouteGuard module="pos">
                <React.Suspense
                  fallback={<DelayedPageFallback variant="pos" label="Đang tải màn hình POS..." />}
                >
                  <LazyPosUnifiedPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'menu',
            element: (
              <RbacRouteGuard module="menu">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải quản trị thực đơn..." />
                  }
                >
                  <LazyMenuManagementPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'invoices',
            element: (
              <RbacRouteGuard module="invoices">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải danh sách hoá đơn..." />
                  }
                >
                  <LazyInvoicesPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'inventory',
            element: (
              <RbacRouteGuard module="inventory">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải quản lý nhập hàng..." />
                  }
                >
                  <LazyInventoryPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'cashflow',
            element: (
              <RbacRouteGuard module="cashflow">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải dòng tiền kết ca..." />
                  }
                >
                  <LazyCashflowPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'payment-qr',
            element: (
              <RbacRouteGuard module="paymentQr">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback
                      variant="table"
                      label="Đang tải quản lý mã QR thanh toán..."
                    />
                  }
                >
                  <LazyPaymentQrPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'discounts',
            element: (
              <RbacRouteGuard module="discounts">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải quản lý mã giảm giá..." />
                  }
                >
                  <LazyDiscountsPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'employees',
            element: (
              <RbacRouteGuard module="employees">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải quản lý nhân sự..." />
                  }
                >
                  <LazyEmployeesPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'schedules',
            element: (
              <RbacRouteGuard module="schedules">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="matrix" label="Đang tải bảng tính ngày công..." />
                  }
                >
                  <LazySchedulesMatrixPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'payroll',
            element: (
              <RbacRouteGuard module="payroll">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải bảng tính lương..." />
                  }
                >
                  <LazyPayrollPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'master-data',
            element: (
              <RbacRouteGuard module="mdm">
                <React.Suspense
                  fallback={
                    <DelayedPageFallback variant="table" label="Đang tải quản trị danh mục..." />
                  }
                >
                  <LazyMasterDataPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'rbac',
            element: (
              <RbacRouteGuard module="rbac">
                <React.Suspense
                  fallback={<DelayedPageFallback variant="table" label="Đang tải phân quyền..." />}
                >
                  <LazyRbacUsersPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'settings',
            element: (
              <RbacRouteGuard module="settings">
                <React.Suspense
                  fallback={<DelayedPageFallback variant="form" label="Đang tải cài đặt..." />}
                >
                  <LazyStoreSettingsPage />
                </React.Suspense>
              </RbacRouteGuard>
            ),
          },
          {
            path: 'profile',
            element: (
              <React.Suspense
                fallback={<DelayedPageFallback variant="form" label="Đang tải hồ sơ..." />}
              >
                <LazyProfilePage />
              </React.Suspense>
            ),
          },
          {
            path: '*',
            element: <NotFoundPage variant="section" />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    errorElement: <RootRouteErrorElement />,
    element: <NotFoundPage variant="page" />,
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes, {
    future: {
      v7_relativeSplatPath: true,
    },
  });
}
