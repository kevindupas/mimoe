import { useEffect, useRef, useState } from "react";
import type { Clip } from "../lib/types";

/** Spots the clip that just arrived at the top of the list (for the entrance animation). */
export function useFreshClip(clips: Clip[]): string | null {
  const [freshId, setFreshId] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const head = clips[0];
    if (head && knownIds.current.size > 0 && !knownIds.current.has(head.id)) {
      setFreshId(head.id);
      const t = setTimeout(() => setFreshId(null), 400);
      knownIds.current = new Set(clips.map((c) => c.id));
      return () => clearTimeout(t);
    }
    knownIds.current = new Set(clips.map((c) => c.id));
  }, [clips]);

  return freshId;
}
