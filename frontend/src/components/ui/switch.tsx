import * as React from 'react'

import { cn } from '@/lib/utils'

function Switch({
  className,
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  ...props
}: Omit<React.ComponentProps<'button'>, 'onChange'> & {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked))
  const isControlled = typeof checked === 'boolean'
  const current = isControlled ? checked : internalChecked

  const toggle = () => {
    if (disabled) return
    const next = !current
    if (!isControlled) {
      setInternalChecked(next)
    }
    onCheckedChange?.(next)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={current}
      data-state={current ? 'checked' : 'unchecked'}
      disabled={disabled}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        current ? 'bg-primary' : 'bg-muted',
        className,
      )}
      onClick={toggle}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm transition-transform',
          current ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export { Switch }