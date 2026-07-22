// Tiny event bus: the share handler (in App root) and the history list (in
// useClips, mounted lower) live in different components. When we post a clip
// from a share, the server rebroadcast is IGNORED by our own device (origin ==
// self), so nothing tells the list to update. We emit here after a successful
// post; useClips subscribes and refetches so the sender sees its own clip
// without a manual pull-to-refresh.
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to "a clip was posted locally"; returns an unsubscribe fn. */
export function onClipsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notify subscribers that the local history should refresh. */
export function emitClipsChanged(): void {
  listeners.forEach((l) => l());
}
