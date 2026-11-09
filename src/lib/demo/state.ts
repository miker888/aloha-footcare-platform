// Prototype only: small shared state for the banner and the database loader.

import { isDemo } from "./flag";

export type DemoStatus = "idle" | "loading" | "ready" | "error";

const RESET_KEY = "aloha-demo-reset";
const CHANNEL = "aloha-demo";

let status: DemoStatus = "idle";
const listeners = new Set<() => void>();

export function setDemoStatus(next: DemoStatus) {
  status = next;
  listeners.forEach((fn) => fn());
}

export function demoStatus(): DemoStatus {
  return status;
}

export function onDemoStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Bumped by "Start over"; part of the browser database's name. */
export function resetCount(): number {
  try {
    return Number(localStorage.getItem(RESET_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

// When another tab starts over, this one reloads onto the fresh data.
if (isDemo && typeof window !== "undefined") {
  const ch = channel();
  if (ch) ch.onmessage = (e) => e.data === "reset" && window.location.reload();
}

/** Throws away everything done in the prototype on this device and reloads the sample data. */
export function startOver() {
  try {
    localStorage.setItem(RESET_KEY, String(resetCount() + 1));
  } catch {
    // Storage blocked: the database lives in memory then, so a reload resets it.
  }
  channel()?.postMessage("reset");
  window.location.reload();
}
