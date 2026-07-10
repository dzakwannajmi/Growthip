"use client";

/**
 * Sparkline.tsx
 *
 * Minimal SVG line chart for showing a small trend inside a summary
 * card (à la "Users" / "Sessions" mini-charts in analytics dashboards).
 * No charting library dependency -- just a hand-rolled polyline, since
 * this only ever needs to plot a short array of numbers, not a full
 * interactive chart.
 */

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

export default function Sparkline({
  data,
  color = "#22c55e",
  width = 100,
  height = 32,
  strokeWidth = 2,
}: SparklineProps) {
  if (data.length < 2) {
    // Not enough points to draw a meaningful line -- render a flat
    // baseline instead of dividing by zero / degenerate SVG.
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={strokeWidth} strokeOpacity={0.3} />
      </svg>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1; // avoid divide-by-zero when all points are equal
  const stepX = width / (data.length - 1);
  const pad = strokeWidth; // keep the line from clipping at the very top/bottom edge

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const gradientId = `sparkline-gradient-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
