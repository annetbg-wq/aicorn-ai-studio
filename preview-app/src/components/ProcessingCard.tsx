import { motion } from "framer-motion";
import { Loader2, Clock, FileAudio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ProcessingCardProps {
  fileName: string;
  progress: number;
}

const stages = [
  { threshold: 0, label: "Uploading audio..." },
  { threshold: 20, label: "Transcribing speech..." },
  { threshold: 50, label: "Analyzing content..." },
  { threshold: 75, label: "Generating summary..." },
  { threshold: 90, label: "Extracting key points..." },
];

function getStage(progress: number) {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (progress >= stages[i].threshold) return stages[i];
  }
  return stages[0];
}

export function ProcessingCard({ fileName, progress }: ProcessingCardProps) {
  const stage = getStage(progress);
  const estimatedTime = Math.max(0, Math.round((100 - progress) * 0.6));

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          {/* Animated Icon */}
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-7 h-7 text-primary" />
              </motion.div>
            </div>
            {/* Pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-primary/30"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileAudio className="w-4 h-4 text-muted-foreground" />
                <p className="font-medium truncate text-sm">{fileName}</p>
              </div>
              <motion.p
                key={stage.label}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-primary font-medium"
              >
                {stage.label}
              </motion.p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <Progress value={Math.min(progress, 100)} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.round(Math.min(progress, 100))}% complete</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ~{estimatedTime}s remaining
                </span>
              </div>
            </div>

            {/* Stage indicators */}
            <div className="flex gap-1.5 pt-1">
              {stages.map((s, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    progress >= s.threshold
                      ? "bg-primary"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}