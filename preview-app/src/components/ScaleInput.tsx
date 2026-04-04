import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ScaleInputProps {
  value: number;
  onChange: (value: number) => void;
}

const PRESETS = [2, 4, 8, 16];

export function ScaleInput({ value, onChange }: ScaleInputProps) {
  const handleChange = (val: number) => {
    const clamped = Math.max(2, Math.min(16, Math.round(val)));
    onChange(clamped);
  };

  return (
    <div className="space-y-2 flex-1">
      <Label htmlFor="scale" className="text-sm">
        Scale Factor
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-[120px]">
          <Input
            id="scale"
            type="number"
            min={2}
            max={16}
            step={1}
            value={value}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            x
          </span>
        </div>
        <div className="flex gap-1">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              variant={value === preset ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(preset)}
              className="h-9 w-10 p-0 text-xs"
            >
              {preset}x
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}