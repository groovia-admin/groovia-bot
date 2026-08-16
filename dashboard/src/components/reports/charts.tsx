"use client";

import { useRef, useState } from "react";

type Point = { label: string; value: number };

const CHART_W = 640;
const CHART_H = 180;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

// Rounds a max value up to a "clean" number (1/2/5 * 10^n) so axis ticks
// read as 0 / 500 / 1,000 rather than 0 / 437 / 874.
function niceMax(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function compactAxisLabel(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v));
}

// A real line chart (gridlines, clean-rounded y-axis ticks, area wash,
// hover crosshair + tooltip) for time-series reports — replaces the old
// plain CSS bar-per-day strip, which had no axis or way to read an exact
// value without a title-attribute tooltip on a 3px-wide div.
export function TrendLineChart({
  data,
  color = "var(--brand)",
  valueFormatter = (v: number) => String(v),
}: {
  data: Point[];
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxValue = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;

  const points = data.map((d, i) => ({
    ...d,
    x: PAD_L + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: PAD_T + innerH - (d.value / maxValue) * innerH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${PAD_T + innerH} L ${points[0].x.toFixed(1)} ${PAD_T + innerH} Z`
      : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: maxValue * f, y: PAD_T + innerH - f * innerH }));
  const xLabelStep = Math.max(1, Math.ceil(data.length / 6));

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < nearestDist) { nearestDist = dist; nearest = i; }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: CHART_H, display: "block", cursor: points.length > 0 ? "crosshair" : "default" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={CHART_W - PAD_R} y1={t.y} y2={t.y} stroke="var(--surface-border)" strokeWidth={1} />
        ))}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD_L - 8} y={t.y + 3} textAnchor="end" fontSize={10} fill="var(--ink-faint)">
            {compactAxisLabel(t.value)}
          </text>
        ))}
        {points.map((p, i) =>
          i % xLabelStep === 0 ? (
            <text key={i} x={p.x} y={CHART_H - 6} textAnchor="middle" fontSize={9} fill="var(--ink-faint)">
              {p.label}
            </text>
          ) : null
        )}
        {areaPath && <path d={areaPath} fill={color} opacity={0.1} stroke="none" />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {hovered && (
          <line x1={hovered.x} x2={hovered.x} y1={PAD_T} y2={PAD_T + innerH} stroke="var(--surface-border)" strokeWidth={1} />
        )}
        {points.length > 0 && (
          <circle
            cx={(hovered ?? points[points.length - 1]).x}
            cy={(hovered ?? points[points.length - 1]).y}
            r={hovered ? 5 : 4}
            fill={color}
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        )}
      </svg>
      {hovered && (
        <div
          style={{
            position: "absolute",
            left: `${(hovered.x / CHART_W) * 100}%`,
            top: `${(hovered.y / CHART_H) * 100}%`,
            transform: `translate(${hovered.x > CHART_W * 0.72 ? "-100%" : "-50%"}, -130%)`,
            background: "var(--ink)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 9px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 10, fontWeight: 500 }}>{hovered.label}</div>
          {valueFormatter(hovered.value)}
        </div>
      )}
    </div>
  );
}

// Horizontal ranked bars — a real magnitude chart (capped thickness, data-end
// rounded/baseline square per the mark spec, hover highlight, bold tabular
// value at the tip) replacing the old plain filled-div bars.
export function RankedBarChart({
  data,
  color = "var(--brand-dark)",
  valueFormatter = (v: number) => String(v),
  capitalizeLabels,
}: {
  data: (Point & { valueLabel?: string })[];
  color?: string;
  valueFormatter?: (v: number) => string;
  capitalizeLabels?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {data.map((d, i) => {
        const pct = Math.max(1, (d.value / max) * 100);
        const hovered = hoverIndex === i;
        return (
          <div
            key={d.label}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}
          >
            <div
              style={{ width: 130, fontSize: "var(--text-sm)", color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: capitalizeLabels ? "capitalize" : undefined }}
              title={d.label}
            >
              {d.label}
            </div>
            <div style={{ flex: 1, position: "relative", height: 16, background: "var(--surface)", borderRadius: 4 }}>
              <div
                style={{
                  position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`,
                  background: color, borderRadius: "0 4px 4px 0",
                  opacity: hovered ? 1 : 0.85,
                  transition: "width .25s ease, opacity .12s ease",
                }}
              />
            </div>
            <div style={{ minWidth: 76, fontSize: "var(--text-sm)", color: "var(--ink)", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {d.valueLabel ?? valueFormatter(d.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
