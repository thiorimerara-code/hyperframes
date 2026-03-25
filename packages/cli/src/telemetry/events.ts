import { trackEvent } from "./client.js";

/**
 * Track a CLI command invocation.
 * This is the primary event — fired for every command.
 */
export function trackCommand(command: string): void {
  trackEvent("cli_command", { command });
}

/**
 * Track a successful render completion with performance metrics.
 */
export function trackRenderComplete(props: {
  durationMs: number;
  fps: number;
  quality: string;
  workers: number;
  docker: boolean;
  gpu: boolean;
}): void {
  trackEvent("render_complete", {
    duration_ms: props.durationMs,
    fps: props.fps,
    quality: props.quality,
    workers: props.workers,
    docker: props.docker,
    gpu: props.gpu,
  });
}

/**
 * Track a render failure (error type only, no message/stack).
 */
export function trackRenderError(props: { fps: number; quality: string; docker: boolean }): void {
  trackEvent("render_error", {
    fps: props.fps,
    quality: props.quality,
    docker: props.docker,
  });
}

/**
 * Track which template was chosen during init.
 */
export function trackInitTemplate(templateId: string): void {
  trackEvent("init_template", { template: templateId });
}

/**
 * Track browser download/ensure events.
 */
export function trackBrowserInstall(success: boolean): void {
  trackEvent("browser_install", { success });
}
