import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Trash2, FolderOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DialogueTree } from "@/types/dialogue";
import { saveTemplate, getTemplates, deleteTemplate, SavedTemplate } from "@/lib/storage";

interface TemplateManagerProps {
  currentTree: DialogueTree | null;
  onLoadTemplate: (tree: DialogueTree) => void;
}

export function TemplateManager({ currentTree, onLoadTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<SavedTemplate[]>(getTemplates());
  const [templateName, setTemplateName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  const handleSave = () => {
    if (!currentTree || !templateName.trim()) return;
    
    const saved = saveTemplate(templateName.trim(), currentTree);
    setTemplates(getTemplates());
    setTemplateName("");
    setShowSaveForm(false);
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setTemplates(getTemplates());
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Saved Templates
        </CardTitle>
        <CardDescription>
          Save and load dialogue templates from local storage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentTree && (
          <div className="space-y-3">
            {!showSaveForm ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowSaveForm(true)}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Current Dialogue
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-2"
              >
                <Label htmlFor="templateName">Template Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="templateName"
                    placeholder="e.g., Tavern Keeper Dialogue"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  />
                  <Button onClick={handleSave} disabled={!templateName.trim()}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setShowSaveForm(false)}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        <Separator />

        {templates.length === 0 ? (
          <div className="text-center py-6">
            <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No saved templates yet</p>
            <p className="text-xs text-muted-foreground">
              Generate a dialogue and save it as a template
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {templates.map((template) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{template.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {template.tree.tone}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(template.savedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onLoadTemplate(template.tree)}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}