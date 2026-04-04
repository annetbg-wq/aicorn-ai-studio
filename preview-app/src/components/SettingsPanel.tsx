import { useState, useEffect } from "react";
import { Settings, Key, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveApiKey, getApiKey } from "@/lib/storage";

interface SettingsPanelProps {
  onApiKeyChange: (key: string) => void;
  apiKey: string;
}

export function SettingsPanel({ onApiKeyChange, apiKey }: SettingsPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);

  useEffect(() => {
    const saved = getApiKey();
    if (saved) {
      setLocalKey(saved);
      onApiKeyChange(saved);
    }
  }, []);

  const handleSave = () => {
    saveApiKey(localKey);
    onApiKeyChange(localKey);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          AI Settings
        </CardTitle>
        <CardDescription>
          Configure your AI provider for dialogue generation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Key
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium">No API key? No problem!</p>
            <p>The generator works with built-in mock data. Add an API key to enable AI-powered generation.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}