#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { VERSION } from "./version.js";
import { showTelemetryNotice, flush, trackCommand, incrementCommandCount } from "./telemetry/index.js";

// ---------------------------------------------------------------------------
// Telemetry — detect command from argv, track it, flush on exit
// ---------------------------------------------------------------------------

const KNOWN_COMMANDS = new Set([
  "init", "dev", "render", "lint", "info", "compositions",
  "benchmark", "browser", "docs", "doctor", "upgrade", "telemetry",
]);

const commandArg = process.argv[2];
const command = commandArg && KNOWN_COMMANDS.has(commandArg) ? commandArg : "unknown";

// Show first-run notice (no-ops if already shown or telemetry disabled)
if (command !== "telemetry") {
  showTelemetryNotice();
  trackCommand(command);
  incrementCommandCount();
}

// Flush telemetry events before exit — non-blocking, 5s timeout
process.on("beforeExit", () => {
  flush().catch(() => {});
});

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const main = defineCommand({
  meta: {
    name: "hyperframes",
    version: VERSION,
    description: "Create and render HTML video compositions",
  },
  subCommands: {
    init: () => import("./commands/init.js").then((m) => m.default),
    dev: () => import("./commands/dev.js").then((m) => m.default),
    render: () => import("./commands/render.js").then((m) => m.default),
    lint: () => import("./commands/lint.js").then((m) => m.default),
    info: () => import("./commands/info.js").then((m) => m.default),
    compositions: () => import("./commands/compositions.js").then((m) => m.default),
    benchmark: () => import("./commands/benchmark.js").then((m) => m.default),
    browser: () => import("./commands/browser.js").then((m) => m.default),
    docs: () => import("./commands/docs.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    upgrade: () => import("./commands/upgrade.js").then((m) => m.default),
    telemetry: () => import("./commands/telemetry.js").then((m) => m.default),
  },
});

runMain(main);
