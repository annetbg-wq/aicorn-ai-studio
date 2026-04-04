import { useMemo } from "react";
import type { MonthlyProjection } from "@/pages/ForecastPage";

interface Props {
  projections: MonthlyProjection[];
  granularity: "monthly" | "quarterly" | "yearly";
  savingsGoal: number;
}

interface Aggregated {
  label: string;
  income: number;
  expenses: number;
  savings: number;
  cumulativeSavings: number;
}

function aggregate(projections: MonthlyProjection[], granularity: "monthly" | "quarterly" | "yearly"): Aggregated[] {
  if (granularity === "monthly") {
    return projections.map((p) => ({
      label: p.month,
      income: p.income,
      expenses: p.expenses,
      savings: p.savings,
      cumulativeSavings: p.cumulativeSavings,
    }));
  }

  const groups: Aggregated[] = [];
  const size = granularity === "quarterly" ? 3 : 12;

  for (let i = 0; i < projections.length; i += size) {
    const slice = projections.slice(i, i + size);
    const income = slice.reduce((s, p) => s + p.income, 0);
    const expenses = slice.reduce((s, p) => s + p.expenses, 0);
    groups.push({
      label: granularity === "quarterly"
        ? `Q${Math.floor(i / 3) + 1} ${slice[0].month.split(" ")[1] || ""}`
        : slice[0].month.split(" ").pop() || slice[0].month,
      income,
      expenses,
      savings: income - expenses,
      cumulativeSavings: slice[slice.length - 1].cumulativeSavings,
    });
  }

  return groups;
}

export default function ForecastChart({ projections, granularity, savingsGoal }: Props) {
  const data = useMemo(() => aggregate(projections, granularity), [projections, granularity]);

  if (data.length === 0) return null;

  const width = 700;
  const height = 320;
  const padTop = 30;
  const padBottom = 50;
  const padLeft = 60;
  const padRight = 20;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const allValues = data.flatMap((d) => [d.income, d.expenses, d.cumulativeSavings]);
  const maxVal = Math.max(...allValues, savingsGoal, 1);
  const minVal = Math.min(0, ...data.map((d) => d.cumulativeSavings));
  const range = maxVal - minVal || 1;

  const toY = (v: number) => padTop + chartH - ((v - minVal) / range) * chartH;
  const barW = Math.max(8, Math.min(28, (chartW / data.length) * 0.35));
  const groupW = chartW / data.length;

  const goalY = toY(savingsGoal);

  const cumulativePath = data
    .map((d, i) => {
      const x = padLeft + i * groupW + groupW / 2;
      return `${i === 0 ? "M" : "L"} ${x} ${toY(d.cumulativeSavings)}`;
    })
    .join(" ");

  const gridLines = 5;
  const gridValues = Array.from({ length: gridLines }, (_, i) =>
    minVal + (range / (gridLines - 1)) * i
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[400px]"
        style={{ maxHeight: 340 }}
      >
        {/* Grid lines */}
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              y1={toY(v)}
              x2={width - padRight}
              y2={toY(v)}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={padLeft - 8}
              y={toY(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              ${Math.round(v).toLocaleString()}
            </text>
          </g>
        ))}

        {/* Savings goal line */}
        {savingsGoal > 0 && savingsGoal >= minVal && savingsGoal <= maxVal && (
          <g>
            <line
              x1={padLeft}
              y1={goalY}
              x2={width - padRight}
              y2={goalY}
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.6}
            />
            <text
              x={width - padRight - 4}
              y={goalY - 6}
              textAnchor="end"
              className="fill-primary"
              fontSize={10}
              fontWeight={600}
            >
              Goal: ${savingsGoal.toLocaleString()}
            </text>
          </g>
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const x = padLeft + i * groupW + groupW / 2;
          return (
            <g key={i}>
              {/* Income bar */}
              <rect
                x={x - barW - 1}
                y={toY(d.income)}
                width={barW}
                height={Math.max(0, toY(0) - toY(d.income))}
                fill="hsl(142 71% 45%)"
                rx={3}
                opacity={0.85}
              >
                <title>Income: ${d.income.toLocaleString()}</title>
              </rect>
              {/* Expenses bar */}
              <rect
                x={x + 1}
                y={toY(d.expenses)}
                width={barW}
                height={Math.max(0, toY(0) - toY(d.expenses))}
                fill="hsl(0 84% 60%)"
                rx={3}
                opacity={0.85}
              >
                <title>Expenses: ${d.expenses.toLocaleString()}</title>
              </rect>
              {/* Label */}
              <text
                x={x}
                y={height - padBottom + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Cumulative savings line */}
        <path
          d={cumulativePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = padLeft + i * groupW + groupW / 2;
          return (
            <circle
              key={i}
              cx={x}
              cy={toY(d.cumulativeSavings)}
              r={3.5}
              fill="hsl(var(--background))"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
            >
              <title>Cumulative: ${d.cumulativeSavings.toLocaleString()}</title>
            </circle>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[hsl(142_71%_45%)]" />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[hsl(0_84%_60%)]" />
          Expenses
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-primary bg-background" />
          Cumulative Savings
        </span>
        {savingsGoal > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-6 border-t-2 border-dashed border-primary" />
            Goal
          </span>
        )}
      </div>
    </div>
  );
}