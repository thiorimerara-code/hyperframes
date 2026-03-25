import { trackEvent } from "./client.js";

export function trackCommand(command: string): void {
  trackEvent("cli_command", { command });
}

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

export function trackRenderError(props: { fps: number; quality: string; docker: boolean }): void {
  trackEvent("render_error", {
    fps: props.fps,
    quality: props.quality,
    docker: props.docker,
  });
}

export function trackInitTemplate(templateId: string): void {
  trackEvent("init_template", { template: templateId });
}

export function trackBrowserInstall(): void {
  trackEvent("browser_install", {});
}
