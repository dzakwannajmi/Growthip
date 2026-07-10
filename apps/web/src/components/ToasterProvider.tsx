"use client";

/**
 * ToasterProvider.tsx
 *
 * Mounts sonner's <Toaster/> once, globally, at the root layout. Root
 * layout.tsx is a Server Component, and Toaster needs client-side
 * interactivity, hence this thin client wrapper.
 *
 * Synced to the app's own dark-mode system via useIsDarkMode() rather
 * than next-themes -- this project has its own localStorage + class
 * toggle system (ThemeToggle.tsx), so next-themes was deliberately not
 * installed to avoid running two independent dark-mode mechanisms
 * side by side.
 */

import { Toaster } from "sonner";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";

export default function ToasterProvider() {
  const isDark = useIsDarkMode();
  return (
    <Toaster
      position="top-center"
      theme={isDark ? "dark" : "light"}
      richColors
      closeButton
    />
  );
}
