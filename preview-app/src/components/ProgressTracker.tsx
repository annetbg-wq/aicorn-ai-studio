import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { pregnancyWeeks, getProgressPercentage, getWeekData } from "@/data/pregnancyData";

interface ProgressTrackerProps {
  currentWeek: number;
  onWeekChange: (week: number) => void;
}

export default function ProgressTracker({ currentWeek, onWeekChange }: ProgressTrackerProps) {
  const progress = getProgressPercentage(currentWeek);
  const weekData = getWeekData(currentWeek);
  const weeksUntilDue = 40 - currentWeek;

  const visibleWeeks = pregnancyWeeks.filter(
    (w) => w.week >= Math.max(4, currentWeek - 3) && w.week <= Math.min(40, currentWeek + 3)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              Pregnancy Progress
            </CardTitle>
            <Badge variant="secondary">{progress}% complete</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Week {currentWeek}</span>
              <span className="text-muted-foreground">
                {weeksUntilDue > 0 ? `${weeksUntilDue} weeks to go` : "Due date!"}
              </span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onWeekChange(Math.max(4, currentWeek - 1))}
              disabled={currentWeek <= 4}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-muted">
              Week {currentWeek}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onWeekChange(Math.min(40, currentWeek + 1))}
              disabled={currentWeek >= 40}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {visibleWeeks.map((week) => (
              <button
                key={week.week}
                onClick={() => onWeekChange(week.week)}
                className={`flex flex-col items-center p-2 rounded-lg min-w-[70px] transition-all ${
                  week.week === currentWeek
                    ? "bg-primary text-primary-foreground shadow-md scale-105"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-lg">{week.sizeEmoji}</span>
                <span className="text-xs font-medium mt-1">W{week.week}</span>
                <span className="text-[10px] truncate max-w-[60px]">{week.babySize}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            {[{ label: "1st Tri", range: "1-12", weeks: [1, 12] }, { label: "2nd Tri", range: "13-27", weeks: [13, 27] }, { label: "3rd Tri", range: "28-40", weeks: [28, 40] }].map((tri) => {
              const isActive = currentWeek >= tri.weeks[0] && currentWeek <= tri.weeks[1];
              const isPast = currentWeek > tri.weeks[1];
              return (
                <div
                  key={tri.label}
                  className={`text-center p-2 rounded-lg border transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : isPast
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <p className="text-xs font-medium">{tri.label}</p>
                  <p className="text-[10px] text-muted-foreground">Weeks {tri.range}</p>
                  {isPast && <span className="text-green-500 text-xs">✓</span>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}