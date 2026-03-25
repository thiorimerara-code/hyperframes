import { readConfig, writeConfig } from "./config.js";
import { VERSION } from "../version.js";

// ---------------------------------------------------------------------------
// PostHog configuration
// ---------------------------------------------------------------------------

// This is a public project API key — safe to embed in client-side code.
// It only allows writing events, not reading data.
const POSTHOG_API_KEY = "__POSTHOG_API_KEY__";
const POSTHOG_HOST = "https://us.i.posthog.com";
const FLUSH_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Dev mode detection — telemetry is disabled when running from source (tsx)
// ---------------------------------------------------------------------------

function isDevMode(): boolean {
  // In dev: files are .ts (running via tsx). In production: bundled .js
  try {
    const url = new URL(import.meta.url);
    return url.pathname.endsWith(".ts");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lightweight PostHog client — we use the HTTP API directly to avoid
// pulling in the full posthog-node SDK and its dependencies.
// All calls are fire-and-forget with a hard timeout.
// ---------------------------------------------------------------------------

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

let eventQueue: Array<{
  event: string;
  properties: EventProperties;
  timestamp: string;
}> = [];

let isEnabled: boolean | null = null;
let anonymousId: string | null = null;

/**
 * Check if telemetry should be active.
 * Disabled when: dev mode, user opted out, CI environment, or HYPERFRAMES_NO_TELEMETRY set.
 */
function shouldTrack(): boolean {
  if (isEnabled !== null) return isEnabled;

  // Environment overrides
  if (process.env["HYPERFRAMES_NO_TELEMETRY"] === "1" || process.env["DO_NOT_TRACK"] === "1") {
    isEnabled = false;
    return false;
  }

  // CI detection
  if (process.env["CI"] === "true" || process.env["CI"] === "1") {
    isEnabled = false;
    return false;
  }

  // Dev mode — never phone home during development
  if (isDevMode()) {
    isEnabled = false;
    return false;
  }

  // Placeholder API key means it hasn't been configured yet
  if (POSTHOG_API_KEY === "__POSTHOG_API_KEY__") {
    isEnabled = false;
    return false;
  }

  const config = readConfig();
  isEnabled = config.telemetryEnabled;
  anonymousId = config.anonymousId;
  return isEnabled;
}

/**
 * Queue a telemetry event. Non-blocking, fail-silent.
 */
export function trackEvent(event: string, properties: EventProperties = {}): void {
  if (!shouldTrack()) return;

  if (!anonymousId) {
    const config = readConfig();
    anonymousId = config.anonymousId;
  }

  eventQueue.push({
    event,
    properties: {
      ...properties,
      cli_version: VERSION,
      os: process.platform,
      arch: process.arch,
      node_version: process.version,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Flush all queued events to PostHog. Called on process exit.
 * Uses the /batch endpoint for efficiency.
 */
export async function flush(): Promise<void> {
  if (eventQueue.length === 0 || !shouldTrack()) {
    eventQueue = [];
    return;
  }

  const batch = eventQueue.map((e) => ({
    event: e.event,
    properties: e.properties,
    distinct_id: anonymousId,
    timestamp: e.timestamp,
  }));
  eventQueue = [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);

  try {
    await fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_API_KEY, batch }),
      signal: controller.signal,
    });
  } catch {
    // Silently ignore — telemetry must never break the CLI
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Show the first-run telemetry notice if it hasn't been shown yet.
 * Returns true if the notice was shown (so callers can add spacing).
 */
export function showTelemetryNotice(): boolean {
  if (!shouldTrack()) return false;

  const config = readConfig();
  if (config.telemetryNoticeShown) return false;

  // Dynamic import to avoid pulling colors into the check path
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

  console.log();
  console.log(`  ${dim("Hyperframes collects anonymous usage data to improve the tool.")}`);
  console.log(`  ${dim("No personal info, file paths, or content is collected.")}`);
  console.log();
  console.log(`  ${dim("Disable anytime:")} ${cyan("hyperframes telemetry disable")}`);
  console.log();

  config.telemetryNoticeShown = true;
  writeConfig(config);
  return true;
}
