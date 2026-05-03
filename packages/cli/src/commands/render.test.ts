import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const producerState = vi.hoisted(() => ({
  createdJobs: [] as Array<Record<string, unknown>>,
  resolveConfigCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("../utils/producer.js", () => ({
  loadProducer: vi.fn(async () => ({
    resolveConfig: vi.fn((overrides: Record<string, unknown>) => {
      producerState.resolveConfigCalls.push(overrides);
      return { ...overrides, resolved: true };
    }),
    createRenderJob: vi.fn((config: Record<string, unknown>) => {
      producerState.createdJobs.push(config);
      return { config, progress: 100 };
    }),
    executeRenderJob: vi.fn(async () => undefined),
  })),
}));

vi.mock("../telemetry/events.js", () => ({
  trackRenderComplete: vi.fn(),
  trackRenderError: vi.fn(),
}));

describe("renderLocal browser GPU config", () => {
  const savedEnv = new Map<string, string | undefined>();

  function setEnv(key: string, value: string) {
    savedEnv.set(key, process.env[key]);
    process.env[key] = value;
  }

  beforeEach(() => {
    producerState.createdJobs = [];
    producerState.resolveConfigCalls = [];
    savedEnv.clear();
  });

  afterEach(() => {
    for (const [key, value] of savedEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.clearAllMocks();
  });

  it("passes an explicit software override for --no-browser-gpu even when env requests hardware", async () => {
    setEnv("PRODUCER_BROWSER_GPU_MODE", "hardware");

    const { renderLocal } = await import("./render.js");
    await renderLocal("/tmp/project", "/tmp/out.mp4", {
      fps: 30,
      quality: "standard",
      format: "mp4",
      gpu: false,
      browserGpu: false,
      hdrMode: "auto",
      quiet: true,
    });

    expect(producerState.resolveConfigCalls).toContainEqual({ browserGpuMode: "software" });
    expect(producerState.createdJobs[0]?.producerConfig).toMatchObject({
      browserGpuMode: "software",
      resolved: true,
    });
  });

  it("passes an explicit hardware override for default local browser GPU", async () => {
    const { renderLocal } = await import("./render.js");
    await renderLocal("/tmp/project", "/tmp/out.mp4", {
      fps: 30,
      quality: "standard",
      format: "mp4",
      gpu: false,
      browserGpu: true,
      hdrMode: "auto",
      quiet: true,
    });

    expect(producerState.resolveConfigCalls).toContainEqual({ browserGpuMode: "hardware" });
    expect(producerState.createdJobs[0]?.producerConfig).toMatchObject({
      browserGpuMode: "hardware",
      resolved: true,
    });
  });

  it("resolves browser GPU from CLI flags, Docker mode, and env fallback", async () => {
    const { resolveBrowserGpuForCli } = await import("./render.js");

    expect(resolveBrowserGpuForCli(false, undefined, undefined)).toBe(true);
    expect(resolveBrowserGpuForCli(false, undefined, "hardware")).toBe(true);
    expect(resolveBrowserGpuForCli(false, undefined, "software")).toBe(false);
    expect(resolveBrowserGpuForCli(false, true, "software")).toBe(true);
    expect(resolveBrowserGpuForCli(false, false, "hardware")).toBe(false);
    expect(resolveBrowserGpuForCli(true, undefined, "hardware")).toBe(false);
  });

  it("forwards parsed --variables payload to createRenderJob", async () => {
    const { renderLocal } = await import("./render.js");
    await renderLocal("/tmp/project", "/tmp/out.mp4", {
      fps: 30,
      quality: "standard",
      format: "mp4",
      gpu: false,
      browserGpu: false,
      hdrMode: "auto",
      quiet: true,
      variables: { title: "Hello", count: 3 },
    });

    expect(producerState.createdJobs[0]?.variables).toEqual({ title: "Hello", count: 3 });
  });

  it("omits variables from createRenderJob when not provided", async () => {
    const { renderLocal } = await import("./render.js");
    await renderLocal("/tmp/project", "/tmp/out.mp4", {
      fps: 30,
      quality: "standard",
      format: "mp4",
      gpu: false,
      browserGpu: false,
      hdrMode: "auto",
      quiet: true,
    });

    expect(producerState.createdJobs[0]?.variables).toBeUndefined();
  });
});

describe("parseVariablesArg", () => {
  it("returns undefined when neither flag is set", async () => {
    const { parseVariablesArg } = await import("./render.js");
    expect(parseVariablesArg(undefined, undefined)).toEqual({ ok: true, value: undefined });
  });

  it("parses inline JSON object", async () => {
    const { parseVariablesArg } = await import("./render.js");
    expect(parseVariablesArg('{"title":"Hello","n":3}', undefined)).toEqual({
      ok: true,
      value: { title: "Hello", n: 3 },
    });
  });

  it("parses file JSON via injected reader", async () => {
    const { parseVariablesArg } = await import("./render.js");
    const fakeReader = (path: string) => {
      if (path === "vars.json") return '{"theme":"dark"}';
      throw new Error("unexpected path");
    };
    expect(parseVariablesArg(undefined, "vars.json", fakeReader)).toEqual({
      ok: true,
      value: { theme: "dark" },
    });
  });

  it("rejects when both flags are set", async () => {
    const { parseVariablesArg } = await import("./render.js");
    const result = parseVariablesArg('{"a":1}', "vars.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.title).toMatch(/Conflicting/);
  });

  it("rejects unparseable JSON with a source-aware title", async () => {
    const { parseVariablesArg } = await import("./render.js");
    const inlineFail = parseVariablesArg("{not json", undefined);
    expect(inlineFail.ok).toBe(false);
    if (!inlineFail.ok) expect(inlineFail.title).toBe("Invalid JSON in --variables");

    const fileFail = parseVariablesArg(undefined, "x", () => "{not json");
    expect(fileFail.ok).toBe(false);
    if (!fileFail.ok) expect(fileFail.title).toBe("Invalid JSON in --variables-file");
  });

  it("rejects non-object payloads (array, string, null)", async () => {
    const { parseVariablesArg } = await import("./render.js");
    for (const payload of ["[1,2]", '"hello"', "null", "42"]) {
      const result = parseVariablesArg(payload, undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.title).toBe("Invalid variables payload");
    }
  });

  it("surfaces filesystem errors from --variables-file", async () => {
    const { parseVariablesArg } = await import("./render.js");
    const result = parseVariablesArg(undefined, "missing.json", () => {
      throw new Error("ENOENT: no such file");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.title).toBe("Could not read --variables-file");
      expect(result.message).toMatch(/missing\.json/);
      expect(result.message).toMatch(/ENOENT/);
    }
  });
});
