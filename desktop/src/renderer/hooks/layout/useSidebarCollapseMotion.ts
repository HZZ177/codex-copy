import { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_COLLAPSE_MOTION_MS = 220;

export function useSidebarCollapseMotion(onToggleSidebar: () => void) {
  const [sidebarMotion, setSidebarMotion] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const startSidebarMotion = useCallback(() => {
    setSidebarMotion(true);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setSidebarMotion(false);
      timerRef.current = null;
    }, SIDEBAR_COLLAPSE_MOTION_MS);
  }, []);

  const toggleSidebar = useCallback(() => {
    startSidebarMotion();
    onToggleSidebar();
  }, [onToggleSidebar, startSidebarMotion]);

  return { sidebarMotion, toggleSidebar, startSidebarMotion };
}
