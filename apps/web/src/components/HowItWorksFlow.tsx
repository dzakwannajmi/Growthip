"use client";

import { memo } from "react";
import {
  ReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { Icon } from "@iconify/react";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";

// ─────────────────────────────────────────────────────────────────────────
// Custom node — branded circle + icon + label, matching the rest of the
// landing page's visual language (rounded icon chip in #F5F5F5, purple
// accent on the "hub" node).
// ─────────────────────────────────────────────────────────────────────────

interface FlowNodeData {
  icon: string;
  label: string;
  sublabel: string;
  variant: "default" | "hub";
  [key: string]: unknown;
}

function FlowNode({ data }: NodeProps) {
  const { icon, label, sublabel, variant } = data as FlowNodeData;
  const isHub = variant === "hub";

  return (
    <div className="flex flex-col items-center gap-3" style={{ width: 160 }}>
      {/* Handles are invisible connection points React Flow needs to draw
          edges — style them away rather than removing them, since removing
          would break edge attachment entirely. */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        className={
          "w-16 h-16 rounded-2xl flex items-center justify-center border " +
          (isHub
            ? "bg-[#00B2FF] border-[#00B2FF] shadow-lg shadow-[#00B2FF]/30"
            : "bg-[#F5F5F5] dark:bg-[#1E1E1E] border-[#E5E5E5] dark:border-[#2A2A2A]")
        }
      >
        <Icon
          icon={icon}
          className={"w-8 h-8 " + (isHub ? "text-white" : "text-[#0A0A0A] dark:text-[#F5F5F5]")}
        />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-bold text-[#0A0A0A] dark:text-[#F5F5F5]">{label}</p>
        <p className="text-[12px] text-[#A3A3A3] dark:text-[#6A6A6A] mt-0.5">{sublabel}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { flowNode: memo(FlowNode) };

// ─────────────────────────────────────────────────────────────────────────
// Static flow definition — You → Growthip Pool → Creator
// ─────────────────────────────────────────────────────────────────────────

const nodes: Node[] = [
  {
    id: "sender",
    type: "flowNode",
    position: { x: 0, y: 60 },
    data: {
      icon: "ph:user-bold",
      label: "You",
      sublabel: "Sends a tip",
      variant: "default",
    },
    draggable: false,
    selectable: false,
  },
  {
    id: "pool",
    type: "flowNode",
    position: { x: 260, y: 0 },
    data: {
      icon: "ph:shield-check-bold",
      label: "Growthip Pool",
      sublabel: "ZK-verified deposit",
      variant: "hub",
    },
    draggable: false,
    selectable: false,
  },
  {
    id: "creator",
    type: "flowNode",
    position: { x: 520, y: 60 },
    data: {
      icon: "ph:hand-coins-bold",
      label: "Creator",
      sublabel: "Claims privately",
      variant: "default",
    },
    draggable: false,
    selectable: false,
  },
];

const edges: Edge[] = [
  {
    id: "sender-pool",
    source: "sender",
    target: "pool",
    animated: true,
    style: { stroke: "#00B2FF", strokeWidth: 2 },
    label: "Encrypted deposit",
    labelStyle: { fontSize: 11, fontWeight: 700, fill: "#00B2FF" },
    labelBgStyle: { fill: "#FAFAFA" },
  },
  {
    id: "pool-creator",
    source: "pool",
    target: "creator",
    animated: true,
    style: { stroke: "#00B2FF", strokeWidth: 2 },
    label: "ZK proof claim",
    labelStyle: { fontSize: 11, fontWeight: 700, fill: "#00B2FF" },
    labelBgStyle: { fill: "#FAFAFA" },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Exported component — fixed, non-interactive canvas (no pan/zoom/drag).
// This is a presentational diagram for a landing page, not an editor, so
// all the interactive affordances React Flow ships by default are turned
// off deliberately.
// ─────────────────────────────────────────────────────────────────────────

export function HowItWorksFlow() {
  const isDark = useIsDarkMode();
  const labelBg = isDark ? "#0A0A0A" : "#FAFAFA";
  const themedEdges: Edge[] = edges.map((e) => ({
    ...e,
    labelBgStyle: { fill: labelBg },
  }));

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ReactFlow
        nodes={nodes}
        edges={themedEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

export default HowItWorksFlow;