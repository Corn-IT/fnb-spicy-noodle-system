import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { CommandPalette } from '@/components/layout/command-palette';
import { MobileSidebarNav, ResizableSidebar } from '@/components/layout/resizable-sidebar';
import { TopNavbar } from '@/components/layout/top-navbar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

export function AppShell() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isPosRoute = location.pathname.startsWith('/pos');

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
      <ResizableSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopNavbar
          queryClient={queryClient}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
        />
        <main
          className={cn(
            'flex-1 min-h-0 flex flex-col p-2.5 sm:p-4 md:p-5',
            isPosRoute ? 'overflow-hidden' : 'overflow-y-auto',
          )}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <MobileSidebarNav onClose={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
