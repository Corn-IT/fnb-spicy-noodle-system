import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

describe('DialogContent viewport behavior', () => {
  it('caps tall dialogs to the viewport and makes their contents scrollable', () => {
    render(
      <Dialog open>
        <DialogContent data-testid="dialog-content">
          <DialogTitle>Modifier dialog</DialogTitle>
          <div style={{ height: 900 }}>Tall content</div>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByTestId('dialog-content')).toHaveClass(
      'max-h-[calc(100dvh-2rem)]',
      'overflow-y-auto',
    );
  });
});
