#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";

import { loadProjectConfig } from "../../../../scripts/ithome/config.mjs";

function fail(message, details) {
  const output = { status: "failed", error: message };
  if (details !== undefined) output.details = details;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  let all = false;
  let day;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--all") all = true;
    else if (argv[index] === "--day") day = Number(argv[++index]);
    else fail(`Unknown argument: ${argv[index]}`);
  }
  if (all === (day !== undefined)) fail("Specify exactly one of --all or --day N");
  if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 30)) fail("Day must be an integer from 1 to 30");
  return all ? Array.from({ length: 30 }, (_, index) => index + 1) : [day];
}

function prepare(day, project) {
  const dayString = String(day).padStart(2, "0");
  const canonicalUrl = `${project.githubPages.publicUrl}/day/${dayString}/`;
  const syncLine = `本文同步刊載於[個人連載網站](${canonicalUrl})`;
  const result = spawnSync(process.execPath, ["scripts/ithome/prepare.mjs", "--day", String(day), "--json"], {
    cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return { day, status: "failed", error: "prepare_failed", stderr: result.stderr.trim() };

  const jsonStart = result.stdout.indexOf("{");
  if (jsonStart < 0) return { day, status: "failed", error: "json_not_found" };
  let payload;
  try { payload = JSON.parse(result.stdout.slice(jsonStart)); }
  catch (error) { return { day, status: "failed", error: "invalid_json", message: error.message }; }

  const fields = [];
  if (payload?.day !== day) fields.push("day");
  if (payload?.dayString !== dayString) fields.push("dayString");
  if (payload?.sourcePath !== `src/content/ironman/day-${dayString}.md`) fields.push("sourcePath");
  if (typeof payload?.title !== "string" || !payload.title) fields.push("title");
  if (payload?.canonicalUrl !== canonicalUrl) fields.push("canonicalUrl");
  if (payload?.syncLine !== syncLine) fields.push("syncLine");
  if (typeof payload?.body !== "string" || !payload.body) fields.push("body");
  if (typeof payload?.body === "string" && payload.body.split(/\r?\n/, 1)[0] !== syncLine) fields.push("bodyFirstLine");
  if (fields.length) return { day, status: "failed", error: "payload_invalid", fields };

  const fingerprint = createHash("sha256")
    .update(`${payload.day}\n${payload.title}\n${payload.canonicalUrl}\n${payload.body}`, "utf8").digest("hex");
  return { day, dayString, sourcePath: payload.sourcePath, title: payload.title, canonicalUrl, syncLine, body: payload.body, fingerprint: `sha256:${fingerprint}`, status: "valid" };
}

try {
  accessSync(resolve(process.cwd(), "package.json"), constants.R_OK);
  accessSync(resolve(process.cwd(), "scripts/ithome/prepare.mjs"), constants.R_OK);
} catch { fail("Run this script from the repository root"); }

const days = parseArgs(process.argv.slice(2));
const project = await loadProjectConfig({ requireInitialized: true });
const items = days.map((day) => prepare(day, project));
const failed = items.filter((item) => item.status !== "valid");
process.stdout.write(`${JSON.stringify({ status: failed.length ? "failed" : "complete", expected: days.length, valid: items.length - failed.length, failed: failed.map((item) => item.day), generatedAt: new Date().toISOString(), items }, null, 2)}\n`);
process.exit(failed.length ? 1 : 0);
  const canonicalUrl = payload?.canonicalUrl;
  const syncLine = `本文同步刊載於[個人連載網站](${canonicalUrl})`;
