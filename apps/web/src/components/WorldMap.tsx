"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import DottedMap from "dotted-map";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";

export interface WorldMapDot {
  start: { lat: number; lng: number; label?: string };
  end: { lat: number; lng: number; label?: string };
}

interface WorldMapProps {
  dots?: WorldMapDot[];
  lineColor?: string;
}

/**
 * Adapted from Aceternity UI's WorldMap component.
 *
 * Deviates from the original source in one deliberate way: the original
 * switches its dot-map colors via `useTheme()` from `next-themes`. Growthip
 * has dark mode disabled app-wide (no <ThemeProvider> mounted), so `theme`
 * would always resolve to `undefined` and the component would permanently
 * render its light variant — a white background with 40%-opacity black
 * dots, which disappears visually on Growthip's already-white page. This
 * version drops the next-themes dependency entirely and hardcodes the dark
 * variant (dark background, light dots), since this component is meant to
 * sit inside an intentionally dark section here, not react to a toggle that
 * doesn't exist in this app.
 */
export function WorldMap({ dots = [], lineColor = "#6b45f3" }: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDark = useIsDarkMode();
  const map = new DottedMap({ height: 100, grid: "diagonal" });

  const svgMap = map.getSVG({
    radius: 0.22,
    color: isDark ? "#FFFFFF30" : "#00000040",
    shape: "circle",
    backgroundColor: isDark ? "#0A0A0A" : "#FAFAFA",
  });

  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  const createCurvedPath = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  return (
    // h-full (not aspect-[2/1]) — this component is meant to fill an
    // explicitly-sized parent (e.g. a min-h-screen hero section) exactly,
    // with no gap from aspect-ratio subpixel rounding at the parent's
    // boundary. object-cover on the raster map + preserveAspectRatio
    // "slice" on the SVG overlay keep both layers cropping identically
    // regardless of the parent's actual aspect ratio, so the animated
    // dots/lines stay visually aligned to the underlying map geography.
    <div className={"w-full h-full relative font-sans overflow-hidden " + (isDark ? "bg-[#0A0A0A]" : "bg-[#FAFAFA]")}>
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="h-full w-full object-cover [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)] pointer-events-none select-none"
        alt="world map"
        height="495"
        width="1056"
        draggable={false}
      />
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full absolute inset-0 pointer-events-none select-none"
      >
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <g key={`path-group-${i}`}>
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                fill="none"
                stroke="url(#path-gradient)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.5 * i, ease: "easeOut" }}
              />
            </g>
          );
        })}

        <defs>
          <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="95%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {dots.map((dot, i) => (
          <g key={`points-group-${i}`}>
            <g key={`start-${i}`}>
              <circle
                cx={projectPoint(dot.start.lat, dot.start.lng).x}
                cy={projectPoint(dot.start.lat, dot.start.lng).y}
                r="2"
                fill={lineColor}
              />
              <circle
                cx={projectPoint(dot.start.lat, dot.start.lng).x}
                cy={projectPoint(dot.start.lat, dot.start.lng).y}
                r="2"
                fill={lineColor}
                opacity="0.5"
              >
                <animate attributeName="r" from="2" to="8" dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
            <g key={`end-${i}`}>
              <circle
                cx={projectPoint(dot.end.lat, dot.end.lng).x}
                cy={projectPoint(dot.end.lat, dot.end.lng).y}
                r="2"
                fill={lineColor}
              />
              <circle
                cx={projectPoint(dot.end.lat, dot.end.lng).x}
                cy={projectPoint(dot.end.lat, dot.end.lng).y}
                r="2"
                fill={lineColor}
                opacity="0.5"
              >
                <animate attributeName="r" from="2" to="8" dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default WorldMap;