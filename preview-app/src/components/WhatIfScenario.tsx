import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sliders, TrendingUp, ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  onSimulate: (savingsRateAdjustment: number) => void;
  baselineSavings: number;
  whatIfSavings: number | null;
  savingsGoal: number;
}

const PRESETS = [
  { label: "Cut 5%", value: 5 },
  { label: "Cut 10%", value: 10 },
  { label: "Cut 15%", value: 15 },
  { label: "Cut 25%", value: 25 },
];

export default function WhatIfScenario({
  onSimulate,
  baselineSavings,
  whatIfSavings,
  savingsGoal,
}: Props) {
  const [adjustment, setAdjustment] = useState(10);

  const handleSimulate = useCallback(() => {
    onSimulate(adjustment);
  }, [onSimulate, adjustment]);

  const diff = whatIfSavings !== null ? whatIfSavings - baselineSavings : null;
  const goalProgress = savingsGoal > 0 && whatIfSavings !== null
    ? Math.min(100, Math.round((whatIfSavings / savingsGoal) * 100))
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sliders className="h-4 w-4" />
          What-If Scenario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Simulate reducing your expenses to see the impact on your savings forecast.
        </p>

        {/* Adjustment selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Expense Reduction</span>
            <span className="text-sm font-bold text-foreground">{adjustment}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={40}
            value={adjustment}
            onChange={(e) => setAdjustment(Number(e.target.value))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={adjustment === p.value ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setAdjustment(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <Button variant="secondary" className="w-full gap-2" size="sm" onClick={handleSimulate}>
          <Sliders className="h-3.5 w-3.5" />
          Run Simulation
        </Button>

        {/* Results */}
        {whatIfSavings !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 pt-2 border-t border-border"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">Baseline</p>
                <p className="text-lg font-bold text-foreground">
                  ${baselineSavings.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3 bg-green-500/5 border-green-500/20">
                <p className="text-xs text-muted-foreground">With {adjustment}% Cut</p>
                <p className="text-lg font-bold text-green-600">
                  ${whatIfSavings.toLocaleString()}
                </p>
              </div>
            </div>

            {diff !== null && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10">
                {diff >= 0 ? (
                  <ArrowUp className="h-4 w-4 text-green-600" />
                ) : (
                  <ArrowDown className="h-4 w-4 text-red-500" />
                )}
                <span className={`text-sm font-medium ${diff >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {diff >= 0 ? "+" : ""}${diff.toLocaleString()} difference
                </span>
              </div>
            )}

            {goalProgress !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Goal Progress</span>
                  <span className="font-medium text-foreground">{goalProgress}%</span>
                </div>
                <Progress value={goalProgress} />
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}