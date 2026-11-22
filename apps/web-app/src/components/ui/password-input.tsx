import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/utils/cn';

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  leftIcon?: React.ReactNode;
  containerClassName?: string;
  toggleTestId?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, containerClassName, leftIcon, toggleTestId, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className={cn('relative', containerClassName)}>
        {leftIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-muted-foreground">
            {leftIcon}
          </span>
        ) : null}

        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={cn('h-11 lg:h-9', leftIcon ? 'pl-9 pr-11 lg:pr-10' : 'pr-11 lg:pr-10', className)}
          {...props}
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          data-testid={toggleTestId}
          className="absolute right-0.5 lg:right-1.5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 lg:h-7 lg:w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
