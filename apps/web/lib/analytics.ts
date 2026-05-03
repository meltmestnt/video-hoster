/**
 * Thin wrapper around Plausible's global `plausible()` function.
 * Safe to call before the script has loaded (events queue up and
 * the real Plausible runtime flushes them once it boots) and safe
 * to call on the server (returns early).
 *
 * Use sparingly — the goal is to know whether the HN launch resonated
 * and which surfaces converted, not to instrument every click.
 */
type PlausibleFn = {
  (
    eventName: string,
    options?: {
      props?: Record<string, string | number | boolean>;
      callback?: () => void;
    },
  ): void;
  q?: unknown[];
};

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  if (!window.plausible) {
    // Stub that queues events until the real Plausible script loads
    // and reassigns this slot. The real runtime reads `q` and flushes
    // every queued call, so events fired during the load window
    // aren't lost.
    const queue: unknown[] = [];
    const stub: PlausibleFn = (...args: unknown[]) => {
      queue.push(args);
    };
    stub.q = queue;
    window.plausible = stub;
  }
  window.plausible(name, props ? { props } : undefined);
}
