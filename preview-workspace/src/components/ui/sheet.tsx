import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-overlay/40 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=open]:fade-in data-[state=closed]:fade-out',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface SheetContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  children: ReactNode;
  /** Hide the default close X — for full-takeover flows. */
  hideClose?: boolean;
}

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, hideClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md',
        'rounded-t-2xl border-t border-border bg-card p-6 pb-8 shadow-2xl safe-bottom',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
        'duration-300',
        className,
      )}
      {...props}
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" aria-hidden />
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('mb-4 flex flex-col gap-1.5 text-left', className)} {...props} />;
}

export const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-xl font-semibold', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

export const SheetDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;
