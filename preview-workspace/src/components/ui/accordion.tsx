import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

type AccordionType = "single" | "multiple"
type AccordionValue = string | string[] | undefined

interface AccordionContextValue {
  type: AccordionType
  collapsible: boolean
  openValues: string[]
  toggle: (value: string) => void
}

interface AccordionItemContextValue {
  value: string
  open: boolean
  disabled: boolean
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)
const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null)

function normalizeValues(value: AccordionValue): string[] {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === "string" && value.length > 0) return [value]
  return []
}

function useAccordionContext() {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error("Accordion components must be wrapped in <Accordion />")
  return context
}

function useAccordionItemContext() {
  const context = React.useContext(AccordionItemContext)
  if (!context) throw new Error("AccordionTrigger and AccordionContent must be wrapped in <AccordionItem />")
  return context
}

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: AccordionType
  collapsible?: boolean
  value?: AccordionValue
  defaultValue?: AccordionValue
  onValueChange?: (value: AccordionValue) => void
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      className,
      children,
      type = "single",
      collapsible = false,
      value,
      defaultValue,
      onValueChange,
      ...props
    },
    ref
  ) => {
    const controlled = value !== undefined
    const [uncontrolledValue, setUncontrolledValue] = React.useState<AccordionValue>(defaultValue)
    const openValues = React.useMemo(
      () => normalizeValues(controlled ? value : uncontrolledValue),
      [controlled, uncontrolledValue, value]
    )

    const commitValue = React.useCallback(
      (nextValues: string[]) => {
        const nextValue: AccordionValue = type === "multiple" ? nextValues : nextValues[0]
        if (!controlled) {
          setUncontrolledValue(nextValue)
        }
        onValueChange?.(nextValue)
      },
      [controlled, onValueChange, type]
    )

    const toggle = React.useCallback(
      (itemValue: string) => {
        if (type === "multiple") {
          commitValue(
            openValues.includes(itemValue)
              ? openValues.filter((value) => value !== itemValue)
              : [...openValues, itemValue]
          )
          return
        }

        if (openValues[0] === itemValue) {
          if (collapsible) commitValue([])
          return
        }

        commitValue([itemValue])
      },
      [collapsible, commitValue, openValues, type]
    )

    return (
      <AccordionContext.Provider value={{ type, collapsible, openValues, toggle }}>
        <div ref={ref} data-slot="accordion" className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    )
  }
)
Accordion.displayName = "Accordion"

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  disabled?: boolean
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, children, value, disabled = false, ...props }, ref) => {
    const { openValues } = useAccordionContext()
    const open = openValues.includes(value)

    return (
      <AccordionItemContext.Provider value={{ value, open, disabled }}>
        <div
          ref={ref}
          data-slot="accordion-item"
          data-state={open ? "open" : "closed"}
          className={cn("border-b", className)}
          {...props}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    )
  }
)
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, onClick, disabled, ...props }, ref) => {
    const { toggle } = useAccordionContext()
    const item = useAccordionItemContext()
    const isDisabled = disabled ?? item.disabled

    return (
      <div className="flex">
        <button
          ref={ref}
          type="button"
          data-slot="accordion-trigger"
          data-state={item.open ? "open" : "closed"}
          aria-expanded={item.open}
          className={cn(
            "group flex flex-1 items-center justify-between gap-4 py-4 text-left font-medium transition-all hover:underline disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
            className
          )}
          disabled={isDisabled}
          onClick={(event) => {
            onClick?.(event)
            if (!event.defaultPrevented && !isDisabled) {
              toggle(item.value)
            }
          }}
          {...props}
        >
          {children}
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </button>
      </div>
    )
  }
)
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const item = useAccordionItemContext()

    return (
      <div
        ref={ref}
        data-slot="accordion-content"
        data-state={item.open ? "open" : "closed"}
        hidden={!item.open}
        className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
        {...props}
      >
        <div className={cn("pb-4 pt-0", className)}>{children}</div>
      </div>
    )
  }
)
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
