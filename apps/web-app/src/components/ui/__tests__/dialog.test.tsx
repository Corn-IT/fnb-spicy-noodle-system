import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

describe('DialogContent viewport behavior', () => {
  it('caps tall dialogs to the viewport and makes their contents scrollable', () => {
    render(
      <Dialog open>
        <DialogContent data-testid="dialog-content">
          <DialogHeader data-testid="dialog-header">
            <DialogTitle>Modifier dialog</DialogTitle>
          </DialogHeader>
          <div style={{ height: 900 }}>Tall content</div>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByTestId('dialog-content')).toHaveClass(
      'grid-cols-1',
      'max-h-[calc(100dvh-2rem)]',
      'overflow-x-hidden',
      'overflow-y-auto',
    );
    expect(screen.getByTestId('dialog-header')).toHaveClass('pr-8');
  });
});
