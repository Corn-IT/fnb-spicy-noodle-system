import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from '../app-error-boundary';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children when healthy and shows staff fallback UI on runtime or chunk load errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <AppErrorBoundary>
        <div>Healthy tree</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Healthy tree')).toBeInTheDocument();

    rerender(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module" />
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId('app-fatal-error-boundary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chính POS' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tải lại trang' }));
    spy.mockRestore();
  });
});
