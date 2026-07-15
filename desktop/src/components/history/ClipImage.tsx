import { useEffect, useState } from "react";
import { tauri } from "../../lib/tauri";

// Cache module : blobId -> URL file://. Une image n'est mise en cache disque +
// résolue qu'une fois ; les re-renders et ré-ouvertures la réutilisent direct.
const srcCache = new Map<string, string>();

/** Aperçu image chargé à la demande (cache disque Rust), jamais en base64 en RAM. */
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
