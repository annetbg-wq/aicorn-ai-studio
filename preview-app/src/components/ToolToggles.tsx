import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface Tool {
  id: string
  name: string
  enabled: boolean
}

interface ToolTogglesProps {
  tools: Tool[]
  onToggle: (toolId: string) => void
}

export default function ToolToggles({ tools, onToggle }: ToolTogglesProps) {
  const enabledCount = tools.filter(t => t.enabled).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {enabledCount} of {tools.length} tools enabled
        </span>
        <Badge variant="outline">
          {Math.round((enabledCount / tools.length) * 100)}%
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tools.map((tool) => (
          <div 
            key={tool.id}
            className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            <Checkbox
              id={tool.id}
              checked={tool.enabled}
              onCheckedChange={() => onToggle(tool.id)}
            />
            <Label 
              htmlFor={tool.id} 
              className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {tool.name}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}