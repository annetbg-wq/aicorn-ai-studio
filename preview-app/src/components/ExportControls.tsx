import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Download, Check, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DialogueTree } from "@/types/dialogue";
import { exportToJSON, copyToClipboard } from "@/lib/aiService";

interface ExportControlsProps {
  tree: DialogueTree | null;
}

export function ExportControls({ tree }: ExportControlsProps) {
  const [copied, setCopied] = useState(false);

  if (!tree) return null;

  const jsonOutput = exportToJSON(tree);

  const handleCopy = async () => {
    await copyToClipboard(jsonOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonOutput], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tree.characterName.toLowerCase().replace(/\s+/g, "-")}-dialogue.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Export Dialogue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="outline" className="flex-1">
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button onClick={handleDownload} className="flex-1">
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
          </div>

          <div className="space-y-2">
            <Textarea
              value={jsonOutput}
              readOnly
              className="font-mono text-xs h-48 resize-none"
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}