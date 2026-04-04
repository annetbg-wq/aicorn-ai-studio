import { AlertTriangle, CheckCircle, Info, TrendingDown, Target } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Insight } from "@/pages/ForecastPage";

interface Props {
  insights: Insight[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    totalSavings: number;
    savingsGoalMet: boolean;
    projectedGoalDate: string | null;
  };
}

const iconMap = {
  warning: AlertTriangle,
  success: CheckCircle,
  info: Info,
  danger: TrendingDown,
};

const colorMap = {
  warning: "text-yellow-600 bg-yellow-500/10",
  success: "text-green-600 bg-green-500/10",
  info: "text-blue-600 bg-blue-500/10",
  danger: "text-red-600 bg-red-500/10",
};

const badgeMap = {
  warning: "outline" as const,
  success: "outline" as const,
  info: "outline" as const,
  danger: "destructive" as const,
};

export default function InsightsSummary({ insights, summary }: Props) {
  const savingsRate =
    summary.totalIncome > 0
      ? Math.round((summary.totalSavings / summary.totalIncome) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4" />
          Key Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">Total Savings</p>
            <p className={`text-lg font-bold ${summary.totalSavings >= 0 ? "text-green-600" : "text-red-500"}`}>
              ${summary.totalSavings.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">Savings Rate</p>
            <p className="text-lg font-bold text-foreground">{savingsRate}%</p>
          </div>
        </div>

        {/* Goal progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Goal Progress
            </span>
            <span className="font-medium text-foreground">
              ${Math.max(0, summary.totalSavings).toLocaleString()} / ${summary.savingsGoalMet ? summary.totalSavings.toLocaleString() : "—"}
            </span>
          </div>
          <Progress value={Math.min(100, Math.max(0, savingsRate * 4))} />
          {summary.projectedGoalDate && (
            <p className="text-xs text-green-600">
              ✓ Projected to reach goal by {summary.projectedGoalDate}
            </p>
          )}
        </div>

        {/* Insight items */}
        <div className="space-y-3">
          {insights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No specific insights generated. Your budget looks balanced!
            </p>
          ) : (
            insights.map((insight, i) => {
              const Icon = iconMap[insight.type];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-3 p-3 rounded-lg border border-border bg-muted/20"
                >
                  <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${colorMap[insight.type]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground">{insight.title}</p>
                      <Badge variant={badgeMap[insight.type]} className="text-[10px] px-1.5 py-0">
                        {insight.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}