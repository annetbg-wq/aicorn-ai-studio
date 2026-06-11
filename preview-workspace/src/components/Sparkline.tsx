interface SparklineProps {
  data: readonly number[];
  className?: string;
  /** Height of the SVG in px. Width is fluid. */
  height?: number;
}

/**
 * Tiny inline sparkline. PRODUCT: swap for a full chart (recharts, visx)
 * once real time-series data is available — but keep the same prop shape.
 */
export function Sparkline({ data, className, height = 80 }: SparklineProps): JSX.Element {
  if (data.length < 2) {
    return <div className={className} aria-label="Not enough data" style={{ height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);
  const width = 600;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ');

  const areaPath = `M0,${height} L${points.replace(/\s/g, ' L')} L${width},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height, width: '100%' }}
      role="img"
      aria-label="Trend"
    >
      <path d={areaPath} fill="rgb(var(--pm-brand) / 0.12)" />
      <polyline points={points} fill="none" stroke="rgb(var(--pm-brand))" strokeWidth={2} />
    </svg>
  );
}
