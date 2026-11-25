import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableFilterDropdown } from '@/components/ui/searchable-filter-dropdown';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Toaster, toast, useToastStore } from '@/components/ui/toast';

function dispatchPointerAndClick(element: HTMLElement) {
  fireEvent.pointerDown(element, { button: 0, pointerType: 'mouse' });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, { button: 0, pointerType: 'mouse' });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element);
}

describe('Toast dismissal while Dialog / Sheet / Popover / Dropdown is open', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    useToastStore.getState().clearToasts();
  });

  it('keeps an open Dialog open when dismissing a corner toast, while still closing on Escape/overlay', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Popup đang thao tác</DialogTitle>
              <DialogDescription>Nội dung form đang nhập</DialogDescription>
              <div data-testid="dialog-body">Đang nhập dữ liệu</div>
            </DialogContent>
          </Dialog>
          <Toaster />
        </>
      );
    }

    render(<Harness />);
    act(() => {
      toast({ title: 'Thông báo góc màn hình', variant: 'success', duration: 60_000 });
    });

    const closeToastBtn = screen.getByLabelText('Đóng thông báo');
    expect(screen.getByTestId('dialog-body')).toBeInTheDocument();

    dispatchPointerAndClick(closeToastBtn);

    await waitFor(() => {
      expect(screen.queryByText('Thông báo góc màn hình')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('dialog-body')).toBeInTheDocument();
  });

  it('keeps an open Sheet (Drawer) open when dismissing a corner toast', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent>
              <SheetTitle>Ngăn kéo đang mở</SheetTitle>
              <SheetDescription>Chi tiết phiếu</SheetDescription>
              <div data-testid="sheet-body">Nội dung Drawer</div>
            </SheetContent>
          </Sheet>
          <Toaster />
        </>
      );
    }

    render(<Harness />);
    act(() => {
      toast({ title: 'Có thông báo mới', variant: 'info', duration: 60_000 });
    });

    const closeToastBtn = screen.getByLabelText('Đóng thông báo');
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument();

    dispatchPointerAndClick(closeToastBtn);

    await waitFor(() => {
      expect(screen.queryByText('Có thông báo mới')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument();
  });

  it('keeps an open Popover open when dismissing a corner toast', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger type="button">Mở popover</PopoverTrigger>
            <PopoverContent>
              <div data-testid="popover-body">Nội dung Popover</div>
            </PopoverContent>
          </Popover>
          <Toaster />
        </>
      );
    }

    render(<Harness />);
    act(() => {
      toast({ title: 'Thông báo Popover', variant: 'warning', duration: 60_000 });
    });

    const closeToastBtn = screen.getByLabelText('Đóng thông báo');
    expect(screen.getByTestId('popover-body')).toBeInTheDocument();

    dispatchPointerAndClick(closeToastBtn);

    await waitFor(() => {
      expect(screen.queryByText('Thông báo Popover')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('popover-body')).toBeInTheDocument();
  });

  it('keeps SearchableFilterDropdown open when dismissing a corner toast', async () => {
    render(
      <>
        <SearchableFilterDropdown
          value="ALL"
          onChange={() => {}}
          options={[
            { value: 'ALL', label: 'Tất cả' },
            { value: 'A', label: 'Mục A' },
          ]}
        />
        <Toaster />
      </>,
    );

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Mục A')).toBeInTheDocument();

    act(() => {
      toast({ title: 'Thông báo khi mở dropdown', variant: 'info', duration: 60_000 });
    });

    const closeToastBtn = screen.getByLabelText('Đóng thông báo');
    dispatchPointerAndClick(closeToastBtn);

    await waitFor(() => {
      expect(screen.queryByText('Thông báo khi mở dropdown')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Mục A')).toBeInTheDocument();
  });
});
