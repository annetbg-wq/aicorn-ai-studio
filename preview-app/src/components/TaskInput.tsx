import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2 } from "lucide-react"

interface TaskInputProps {
  value: string
  onChange: (value: string) => void
  onGenerate: () => void
  isLoading: boolean
}

export default function TaskInput({ value, onChange, onGenerate, isLoading }: TaskInputProps) {
  return (
    <div className="space-y-4">
      <Textarea
        placeholder="Describe your task... (e.g., 'Schedule meeting with marketing team for next Tuesday to discuss Q3 campaign')"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[120px] resize-none"
      />
      <Button 
        onClick={onGenerate} 
        disabled={!value.trim() || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Routing...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Route My Task
          </>
        )}
      </Button>
    </div>
  )
}