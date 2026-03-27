import { defineCommand } from "citty";
import { existsSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import * as clack from "@clack/prompts";
import { c } from "../ui/colors.js";

// ---------------------------------------------------------------------------
// Target CLI tools — each has a global skills directory
// ---------------------------------------------------------------------------

interface Target {
  name: string;
  flag: string;
  /** Agent name for `npx skills add -a <agent>` */
  skillsAgent: string;
  dir: string;
  defaultEnabled: boolean;
}

const TARGETS: Target[] = [
  {
    name: "Claude Code",
    flag: "claude",
    skillsAgent: "claude-code",
    dir: join(homedir(), ".claude", "skills"),
    defaultEnabled: true,
  },
  {
    name: "Gemini CLI",
    flag: "gemini",
    skillsAgent: "gemini-cli",
    dir: join(homedir(), ".gemini", "skills"),
    defaultEnabled: true,
  },
  {
    name: "Codex CLI",
    flag: "codex",
    skillsAgent: "codex",
    dir: join(homedir(), ".codex", "skills"),
    defaultEnabled: true,
  },
  {
    name: "Cursor",
    flag: "cursor",
    skillsAgent: "cursor",
    get dir() {
      return join(process.cwd(), ".cursor", "skills");
    },
    defaultEnabled: false,
  },
];

// ---------------------------------------------------------------------------
// Skill sources — GitHub repos containing skill directories
// ---------------------------------------------------------------------------

interface SkillSource {
  name: string;
  /** GitHub shorthand (owner/repo) or full URL */
  repo: string;
  /** For fallback: subdirectory within the repo that contains skill folders */
  skillsPath: string;
  /** For fallback: local cache directory */
  cache: string;
}

const SOURCES: SkillSource[] = [
  {
    name: "HyperFrames",
    repo: "heygen-com/hyperframes",
    skillsPath: "skills",
    cache: join(homedir(), ".cache", "hyperframes", "hyperframes-skills"),
  },
  {
    name: "GSAP",
    repo: "greensock/gsap-skills",
    skillsPath: "skills",
    cache: join(homedir(), ".cache", "hyperframes", "gsap-skills"),
  },
];

// ---------------------------------------------------------------------------
// npx skills add — primary install method
// ---------------------------------------------------------------------------

function hasNpx(): boolean {
  try {
    execFileSync("npx", ["--version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function runSkillsAdd(repo: string, agents: string[], global: boolean): void {
  const args = ["skills", "add", repo, "-y"];
  if (global) args.push("-g");
  for (const agent of agents) {
    args.push("-a", agent);
  }
  execFileSync("npx", args, {
    stdio: "ignore",
    timeout: 120_000,
  });
}

// ---------------------------------------------------------------------------
// Fallback — git clone + copy (used when npx skills add is unavailable)
// ---------------------------------------------------------------------------

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

function gitClone(repo: string, dest: string): void {
  execFileSync("git", ["clone", "--depth", "1", repo, dest], {
    stdio: "ignore",
    timeout: 60_000,
    env: GIT_ENV,
  });
}

function fetchRepo(source: SkillSource): string | undefined {
  const gitUrl = `https://github.com/${source.repo}.git`;
  if (existsSync(source.cache)) {
    try {
      execFileSync("git", ["pull", "--ff-only"], {
        cwd: source.cache,
        stdio: "ignore",
        timeout: 30_000,
        env: GIT_ENV,
      });
    } catch {
      const skillsDir = join(source.cache, source.skillsPath);
      if (existsSync(skillsDir)) return skillsDir;
      rmSync(source.cache, { recursive: true, force: true });
      gitClone(gitUrl, source.cache);
    }
  } else {
    mkdirSync(dirname(source.cache), { recursive: true });
    gitClone(gitUrl, source.cache);
  }
  const skillsDir = join(source.cache, source.skillsPath);
  return existsSync(skillsDir) ? skillsDir : undefined;
}

interface InstalledSkill {
  name: string;
  source: string;
}

function installSkillsFromDir(
  sourceDir: string,
  targetDir: string,
  sourceName: string,
): InstalledSkill[] {
  const installed: InstalledSkill[] = [];
  if (!existsSync(sourceDir)) return installed;

  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(sourceDir, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    const destDir = join(targetDir, entry.name);
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });
    cpSync(join(sourceDir, entry.name), destDir, { recursive: true });
    installed.push({ name: entry.name, source: sourceName });
  }
  return installed;
}

function fallbackInstall(targets: Target[]): {
  count: number;
  installed: InstalledSkill[];
  skipped: string[];
} {
  const skipped: string[] = [];
  const fetched: { source: SkillSource; skillsDir: string }[] = [];

  for (const source of SOURCES) {
    try {
      const skillsDir = fetchRepo(source);
      if (skillsDir) {
        fetched.push({ source, skillsDir });
      } else {
        skipped.push(source.name);
      }
    } catch {
      skipped.push(source.name);
    }
  }

  // Install to first target and collect results, then copy to remaining targets
  const [first, ...rest] = targets;
  const allInstalled: InstalledSkill[] = [];
  if (first) {
    mkdirSync(first.dir, { recursive: true });
    for (const { skillsDir, source } of fetched) {
      allInstalled.push(...installSkillsFromDir(skillsDir, first.dir, source.name));
    }
  }
  for (const target of rest) {
    mkdirSync(target.dir, { recursive: true });
    for (const { skillsDir, source } of fetched) {
      installSkillsFromDir(skillsDir, target.dir, source.name);
    }
  }

  return { count: allInstalled.length, installed: allInstalled, skipped };
}

// ---------------------------------------------------------------------------
// Programmatic API — used by init command
// ---------------------------------------------------------------------------

export { TARGETS };

export async function installAllSkills(
  targetNames?: string[],
): Promise<{ count: number; targets: string[]; skipped: string[] }> {
  const targets = targetNames
    ? TARGETS.filter((t) => targetNames.includes(t.flag))
    : TARGETS.filter((t) => t.defaultEnabled);
  const agents = targets.map((t) => t.skillsAgent);

  // Try npx skills add first
  if (hasNpx()) {
    const skipped: string[] = [];
    let count = 0;
    for (const source of SOURCES) {
      try {
        runSkillsAdd(source.repo, agents, true);
        count += 1; // count sources, not individual skills (we don't get that from npx)
      } catch {
        skipped.push(source.name);
      }
    }
    if (count > 0) {
      return { count, targets: targets.map((t) => t.name), skipped };
    }
    // npx skills add failed for all sources — try fallback
  }

  // Fallback: git clone + copy
  if (!hasGit()) {
    return { count: 0, targets: [], skipped: SOURCES.map((s) => s.name) };
  }
  const result = fallbackInstall(targets);
  return { count: result.count, targets: targets.map((t) => t.name), skipped: result.skipped };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

function resolveTargets(args: Record<string, unknown>): Target[] {
  const hasAnyFlag = TARGETS.some((t) => args[t.flag] === true);
  if (hasAnyFlag) {
    return TARGETS.filter((t) => args[t.flag] === true);
  }
  return TARGETS.filter((t) => t.defaultEnabled);
}

async function runInstall({ args }: { args: Record<string, unknown> }): Promise<void> {
  clack.intro(c.bold("hyperframes skills"));

  const targets = resolveTargets(args);
  const agents = targets.map((t) => t.skillsAgent);

  // Try npx skills add
  if (hasNpx()) {
    const installed: string[] = [];
    const skippedSources: string[] = [];

    for (const source of SOURCES) {
      const spinner = clack.spinner();
      spinner.start(`Installing ${source.name} skills...`);
      try {
        runSkillsAdd(source.repo, agents, true);
        installed.push(source.name);
        spinner.stop(c.success(`${source.name} skills installed`));
      } catch {
        skippedSources.push(source.name);
        spinner.stop(c.dim(`${source.name} skills skipped (unavailable)`));
      }
    }

    console.log();
    console.log(`   ${c.dim("Targets:")}  ${targets.map((t) => t.name).join(", ")}`);
    if (skippedSources.length > 0) {
      console.log(`   ${c.dim("Skipped:")}  ${skippedSources.join(", ")}`);
    }
    console.log();

    if (installed.length > 0) {
      clack.outro(c.success(`${installed.join(" + ")} skills installed.`));
      return;
    }

    clack.log.warn("npx skills add failed — trying fallback...");
  }

  // Fallback: git clone + copy
  if (!hasGit()) {
    clack.log.error(c.error("Neither npx nor git available. Install Node.js or git and retry."));
    clack.outro(c.warn("No skills installed."));
    return;
  }

  clack.log.info(c.dim("Using git fallback..."));

  const result = fallbackInstall(targets);

  console.log();
  for (const source of SOURCES) {
    const names = result.installed.filter((s) => s.source === source.name).map((s) => s.name);
    if (names.length > 0) {
      const label = `${source.name}:`.padEnd(14);
      console.log(`   ${c.dim(label)} ${names.map((s) => c.accent(s)).join(", ")}`);
    }
  }
  console.log(`   ${c.dim("Targets:")}      ${targets.map((t) => t.name).join(", ")}`);
  if (result.skipped.length > 0) {
    console.log(`   ${c.dim("Skipped:")}      ${result.skipped.join(", ")}`);
  }
  console.log();

  if (result.count > 0) {
    clack.outro(c.success(`${result.count} skills ready.`));
  } else {
    clack.outro(c.warn("No skills installed."));
  }
}

export default defineCommand({
  meta: {
    name: "skills",
    description: `Install HyperFrames and GSAP skills for AI coding tools

Examples:
  hyperframes skills                      # install to Claude, Gemini, Codex
  hyperframes skills --claude             # install to Claude Code only
  hyperframes skills --cursor             # install to Cursor (project-level)
  hyperframes skills --claude --gemini    # install to specific tools`,
  },
  args: {
    claude: { type: "boolean", description: "Install to Claude Code (~/.claude/skills/)" },
    gemini: { type: "boolean", description: "Install to Gemini CLI (~/.gemini/skills/)" },
    codex: { type: "boolean", description: "Install to Codex CLI (~/.codex/skills/)" },
    cursor: {
      type: "boolean",
      description: "Install to Cursor (.cursor/skills/ in current project)",
    },
    "human-friendly": { type: "boolean", description: "Enable interactive terminal UI" },
  },
  run: runInstall,
});
