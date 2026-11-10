import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from './login-page';

const { mutateAsyncMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
}));

vi.mock('@/features/profile/api/auth.api', () => ({
  useLoginMutation: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderLogin(fromPath?: string) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/login',
          state: fromPath ? { from: { pathname: fromPath } } : null,
        },
      ]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/rbac" element={<h1>403 — Không đủ quyền truy cập</h1>} />
        <Route path="/pos" element={<h1>Màn hình POS</h1>} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>,
  );
}

async function submitLogin() {
  fireEvent.change(screen.getByLabelText('Tên đăng nhập'), {
    target: { value: 'cashier01' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), {
    target: { value: 'Password@123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập Quầy POS' }));
  await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
}

describe('LoginPage return navigation', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({});
  });

  it('returns an authenticated user to the originally requested protected route', async () => {
    renderLogin('/rbac');

    await submitLogin();

    expect(await screen.findByRole('heading', { name: '403 — Không đủ quyền truy cập' })).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/rbac');
  });

  it('defaults to POS when login has no protected-route destination', async () => {
    renderLogin();

    await submitLogin();

    expect(await screen.findByRole('heading', { name: 'Màn hình POS' })).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/pos');
  });

  it('ignores protocol-relative destinations and defaults to POS', async () => {
    renderLogin('//outside.example/rbac');

    await submitLogin();

    expect(await screen.findByRole('heading', { name: 'Màn hình POS' })).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/pos');
  });
});
