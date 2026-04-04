import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, CheckCircle2, FileAudio, Clock, Users, ListChecks, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SummaryResult {
  fileName: string;
  fileSize: string;
  duration: string;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  participants: string[];
}

interface SummaryCardProps {
  result: SummaryResult;
}

export function SummaryCard({ result }: SummaryCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const generatePlainText = () => {
    let text = `MEETING SUMMARY\n`;
    text += `${"=".repeat(50)}\n\n`;
    text += `File: ${result.fileName}\n`;
    text += `Duration: ${result.duration}\n\n`;
    text += `SUMMARY\n${"-".repeat(30)}\n${result.summary}\n\n`;
    text += `KEY POINTS\n${"-".repeat(30)}\n`;
    result.keyPoints.forEach((point, i) => {
      text += `${i + 1}. ${point}\n`;
    });
    text += `\nACTION ITEMS\n${"-".repeat(30)}\n`;
    result.actionItems.forEach((item, i) => {
      text += `${i + 1}. ${item}\n`;
    });
    text += `\nPARTICIPANTS\n${"-".repeat(30)}\n`;
    result.participants.forEach((p) => {
      text += `• ${p}\n`;
    });
    return text;
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(generatePlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySection = async (section: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      {/* Header Card */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileAudio className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Meeting Summary</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {result.fileName}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {result.fileSize}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopyAll}>
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Clock className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{result.duration}</p>
            <p className="text-xs text-muted-foreground">Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Users className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{result.participants.length}</p>
            <p className="text-xs text-muted-foreground">Participants</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ListChecks className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{result.actionItems.length}</p>
            <p className="text-xs text-muted-foreground">Action Items</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Summary */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                Summary
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopySection("summary", result.summary)}
              >
                {copiedSection === "summary" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Key Points */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                Key Points
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleCopySection("keypoints", result.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n"))
                }
              >
                {copiedSection === "keypoints" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {result.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm text-muted-foreground pt-0.5">{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Action Items */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Action Items
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleCopySection("actions", result.actionItems.map((a, i) => `${i + 1}. ${a}`).join("\n"))
                }
              >
                {copiedSection === "actions" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {result.actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-5 w-5 rounded border-2 border-primary/30 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-sm bg-primary/50" />
                  </div>
                  <span className="text-sm text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Participants */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {result.participants.map((participant) => (
                <Badge key={participant} variant="secondary">
                  {participant}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}