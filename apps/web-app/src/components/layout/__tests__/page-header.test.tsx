import { DEFAULT_STORE_SETTINGS, NEUTRAL_STORE_SETTINGS } from '@fnb/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { PageHeader } from '../page-header';

function renderWithSettings(
  ui: React.ReactElement,
  pageHeaders: Record<string, { title: string; subtitle: string }> = {},
) {
  return render(
    <StoreSettingsContext.Provider
      value={{
        settings: {
          ...NEUTRAL_STORE_SETTINGS,
          ...DEFAULT_STORE_SETTINGS,
          pageHeaders,
        },
      }}
    >
      {ui}
    </StoreSettingsContext.Provider>,
  );
}

describe('<PageHeader /> (AC-15.6..AC-15.8)', () => {
  it('hides /pos header when uncustomized and reveals plain-text overrides when customized', () => {
    const { rerender } = renderWithSettings(
      <PageHeader path="/pos" defaultTitle="Bán hàng POS" hideWhenDefault />,
      {},
    );
    expect(screen.queryByTestId('page-header')).toBeNull();

    rerender(
      <StoreSettingsContext.Provider
        value={{
          settings: {
            ...NEUTRAL_STORE_SETTINGS,
            ...DEFAULT_STORE_SETTINGS,
            pageHeaders: {
              '/pos': { title: '<script>alert(1)</script>Quầy POS', subtitle: 'Ca sáng' },
            },
          },
        }}
      >
        <PageHeader path="/pos" defaultTitle="Bán hàng POS" hideWhenDefault />
      </StoreSettingsContext.Provider>,
    );

    expect(screen.getByTestId('page-header-title').textContent).toBe('<script>alert(1)</script>Quầy POS');
    expect(screen.getByTestId('page-header-subtitle').textContent).toBe('Ca sáng');
    expect(screen.getByTestId('page-header-title').querySelector('script')).toBeNull();
  });

  it('preserves defaultSubtitleNode on /cashflow until custom subtitle is set', () => {
    const { rerender } = renderWithSettings(
      <PageHeader
        path="/cashflow"
        defaultTitle="Ngân sách, Dòng tiền & Đối soát Kết ca"
        defaultSubtitleNode={
          <span>
            Ngân sách đầu ca: <strong data-testid="dynamic-budget">1.000.000 đ</strong>
          </span>
        }
      />,
      {},
    );

    expect(screen.getByTestId('dynamic-budget').textContent).toBe('1.000.000 đ');

    rerender(
      <StoreSettingsContext.Provider
        value={{
          settings: {
            ...NEUTRAL_STORE_SETTINGS,
            ...DEFAULT_STORE_SETTINGS,
            pageHeaders: {
              '/cashflow': { title: '', subtitle: 'Mô tả kết ca mới' },
            },
          },
        }}
      >
        <PageHeader
          path="/cashflow"
          defaultTitle="Ngân sách, Dòng tiền & Đối soát Kết ca"
          defaultSubtitleNode={
            <span>
              Ngân sách đầu ca: <strong data-testid="dynamic-budget">1.000.000 đ</strong>
            </span>
          }
        />
      </StoreSettingsContext.Provider>,
    );

    expect(screen.queryByTestId('dynamic-budget')).toBeNull();
    expect(screen.getByTestId('page-header-subtitle').textContent).toBe('Mô tả kết ca mới');
  });
});
