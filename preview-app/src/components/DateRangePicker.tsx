import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  value: string
  onChange: (value: string) => void
}

const ranges = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
]

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
      <Calendar className="h-4 w-4 text-muted-foreground ml-2" />
      {ranges.map((range) => (
        <Button
          key={range.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(range.value)}
          className={cn(
            "px-3",
            value === range.value && "bg-background text-foreground shadow-sm"
          )}
        >
          {range.label}
        </Button>
      ))}
    </div>
  )
}