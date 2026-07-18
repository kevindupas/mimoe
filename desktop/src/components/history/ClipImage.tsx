import { useEffect, useState } from "react";
import { tauri } from "../../lib/tauri";

// Module-level cache: blobId -> file:// URL. An image is written to the disk cache
// and resolved only once; re-renders and re-openings reuse it directly.
const srcCache = new Map<string, string>();

/** Image preview loaded on demand (Rust disk cache), never as base64 in RAM. */
export function ClipImage({ blobId, className }: { blobId: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(() => srcCache.get(blobId) ?? null);

  useEffect(() => {
    if (srcCache.has(blobId)) {
      setSrc(srcCache.get(blobId)!);
      return;
    }
    let ok = true;
    tauri
      .imageSrc(blobId)
      .then((s) => {
        srcCache.set(blobId, s);
        if (ok) setSrc(s);
      })
      .catch((e) => console.error("cache_image", e));
    return () => {
      ok = false;
    };
  }, [blobId]);

  if (!src) {
    return (
      <div className="flex h-[80px] w-full items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }
  return <img src={src} alt="image" className={className} />;
}
