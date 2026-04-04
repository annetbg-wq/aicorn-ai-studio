import { useState, useEffect } from "react";
import { User, Mic, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { GenerationConfig, TONES } from "@/types/dialogue";
import { saveConfig, getConfig } from "@/lib/storage";

interface CharacterFormProps {
  onGenerate: (config: GenerationConfig) => void;
  isLoading: boolean;
}

export function CharacterForm({ onGenerate, isLoading }: CharacterFormProps) {
  const [config, setConfig] = useState<GenerationConfig>({
    characterName: "",
    characterDescription: "",
    tone: "friendly",
    choiceCount: 3,
    sceneContext: "",
  });

  useEffect(() => {
    const saved = getConfig();
    if (saved) {
      setConfig(saved);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig(config);
    onGenerate(config);
  };

  const updateConfig = (field: keyof GenerationConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Character Configuration
        </CardTitle>
        <CardDescription>
          Define your NPC's personality and dialogue structure
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="characterName" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Character Name
            </Label>
            <Input
              id="characterName"
              placeholder="e.g., Grumpy Blacksmith, Wise Elder"
              value={config.characterName}
              onChange={(e) => updateConfig("characterName", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="characterDescription" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Character Description
            </Label>
            <Textarea
              id="characterDescription"
              placeholder="Brief description of the character's background, appearance, or role..."
              value={config.characterDescription}
              onChange={(e) => updateConfig("characterDescription", e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Dialogue Tone
            </Label>
            <Select value={config.tone} onValueChange={(value) => updateConfig("tone", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tone" />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((tone) => (
                  <SelectItem key={tone.value} value={tone.value}>
                    <div className="flex flex-col">
                      <span>{tone.label}</span>
                      <span className="text-xs text-muted-foreground">{tone.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="choiceCount">Number of Choices per Node</Label>
            <Select
              value={config.choiceCount.toString()}
              onValueChange={(value) => updateConfig("choiceCount", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 choices</SelectItem>
                <SelectItem value="3">3 choices</SelectItem>
                <SelectItem value="4">4 choices</SelectItem>
                <SelectItem value="5">5 choices</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sceneContext">Scene Context (Optional)</Label>
            <Textarea
              id="sceneContext"
              placeholder="e.g., A tavern at midnight, a throne room, a forest clearing..."
              value={config.sceneContext}
              onChange={(e) => updateConfig("sceneContext", e.target.value)}
              rows={2}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading || !config.characterName}>
            {isLoading ? (
              <>
                <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Dialogue
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}