let actx: AudioContext | null = null;

/** Petit « pop » synthétisé (WebAudio), sans fichier asset. */
export function pop(): void {
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.connect(g);
    g.connect(actx.destination);
    o.frequency.setValueAtTime(880, actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, actx.currentTime + 0.06);
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, actx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.12);
    o.start();
    o.stop(actx.currentTime + 0.13);
  } catch {
    /* audio indisponible : on ignore */
  }
}
