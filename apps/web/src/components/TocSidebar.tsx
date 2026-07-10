"use client";

/**
 * TocSidebar.tsx
 *
 * Thin client wrapper around LineSidebar for use from Server Components
 * (terms/page.tsx, privacy/page.tsx both export `metadata`, which
 * requires them to stay Server Components). A Server Component can't
 * pass a function prop like onItemClick directly to a Client Component
 * -- so the click-to-scroll logic lives entirely in here instead,
 * driven only by the serializable `items` string array the page passes
 * in. Each item's id is derived via the same slugify() used to set the
 * matching <section id="..."> in the page.
 */

import LineSidebar from "@/components/LineSidebar";
import { slugify } from "@/lib/slugify";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";

interface TocSidebarProps {
  items: string[];
}

export default function TocSidebar({ items }: TocSidebarProps) {
  const isDark = useIsDarkMode();

  function handleItemClick(_index: number, label: string) {
    const el = document.getElementById(slugify(label));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <LineSidebar
      // Forces a full unmount+remount whenever `items` changes (e.g.
      // navigating between /terms and /privacy, which share this same
      // component position in the tree via the shared (main) layout).
      // Without this, React reconciles LineSidebar as the "same"
      // instance across client-side navigation and reuses its internal
      // refs (itemRefs/targetsRef/currentRef) from the PREVIOUS page,
      // leaving the pointer-tracking effect stale/non-functional until
      // a hard reload forces a genuinely fresh mount.
      key={items.join("|")}
      items={items}
      onItemClick={handleItemClick}
      accentColor="#00B2FF"
      textColor={isDark ? "#6A6A6A" : "#A3A3A3"}
      markerColor={isDark ? "#3A3A3A" : "#D4D4D4"}
      showIndex={false}
      proximityRadius={70}
      maxShift={12}
      itemGap={16}
      fontSize={0.9}
      markerLength={28}
    />
  );
}
