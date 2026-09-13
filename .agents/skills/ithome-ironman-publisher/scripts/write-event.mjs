#!/usr/bin/env node

import { constants, chmodSync, closeSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadProjectConfigSync } from "../../../../scripts/ithome/config.mjs";

const project = loadProjectConfigSync();

function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
function validTimestamp(value) { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function validIthomeUrl(value, pathPattern) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "ithelp.ithome.com.tw" && pathPattern.test(url.pathname);
  } catch { return false; }
}

const FORBIDDEN_KEY = /^(body|cookies?|session(?:State)?|telegram(?:Token|Credential)?|token|screenshots?|html(?:Dump)?)$/i;

function findForbiddenKey(value, path = []) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (FORBIDDEN_KEY.test(key)) return nextPath.join(".");
    const nested = findForbiddenKey(child, nextPath);
    if (nested) return nested;
  }
  return null;
}

function validate(event) {
  const errors = [];
  const forbidden = findForbiddenKey(event);
  if (forbidden) errors.push(`forbidden:${forbidden}`);
  if (event?.schemaVersion !== 1) errors.push("schemaVersion");
  if (typeof event?.eventId !== "string" || event.eventId.length < 8) errors.push("eventId");
  if (event?.source !== "codex-ithome-ironman-publisher") errors.push("source");
  if (event?.repository !== project.repository) errors.push("repository");
  if (event?.series !== project.seriesKey) errors.push("series");
  if (!validTimestamp(event?.completedAt)) errors.push("completedAt");
  if (typeof event?.runId !== "string" || !event.runId) errors.push("runId");

  if (event?.operation === "bootstrap-series") {
    if (!["verified", "incomplete", "failed", "uncertain"].includes(event.status)) errors.push("status");
    if (event.day !== 1) errors.push("day");
    if (event.status === "verified") {
      if (!validIthomeUrl(event.articleUrl, /^\/articles\/[^/]+\/?$/)) errors.push("articleUrl");
      if (!validIthomeUrl(event.seriesUrl, /^(?:\/ironman\/|\/users\/[^/]+\/ironman\/)[^/]+\/?$/)) errors.push("seriesUrl");
      if (typeof event.seriesId !== "string" || !event.seriesId) errors.push("seriesId");
      else {
        const match = new URL(event.seriesUrl).pathname.match(/^(?:\/ironman\/|\/users\/[^/]+\/ironman\/)([^/]+)\/?$/);
        if (!match || match[1] !== event.seriesId) errors.push("seriesIdentityInvariant");
      }
      if (!validTimestamp(event.publishedAt)) errors.push("publishedAt");
    } else if (typeof event.failure?.reasonCode !== "string" || !event.failure.reasonCode) errors.push("failure.reasonCode");
  } else if (event?.operation === "audit-drafts") {
    if (!["complete", "incomplete", "conflict", "failed"].includes(event.status)) errors.push("status");
    if (event.expected !== 30) errors.push("expected");
    for (const field of ["missing", "duplicate", "mismatch"]) if (!Array.isArray(event[field])) errors.push(field);
    if (Array.isArray(event.duplicate) && event.duplicate.some((entry) => !Number.isInteger(entry?.day) || entry.day < 1 || entry.day > 30 || !Number.isInteger(entry?.count) || entry.count < 2)) errors.push("duplicate.entries");
    if (Array.isArray(event.mismatch) && event.mismatch.some((entry) => !Number.isInteger(entry?.day) || entry.day < 1 || entry.day > 30 || !Array.isArray(entry?.fields) || entry.fields.length === 0 || entry.fields.some((field) => !["title", "canonicalUrl", "status"].includes(field)))) errors.push("mismatch.entries");
    if (!validTimestamp(event.auditedAt)) errors.push("auditedAt");
    if (!["complete", "partial", "unknown"].includes(event.confidence)) errors.push("confidence");
    if (event.status === "failed" && (typeof event.failure?.reasonCode !== "string" || !event.failure.reasonCode || typeof event.failure?.phase !== "string" || !event.failure.phase)) errors.push("failure");
    if (event.status === "complete" && (event.foundUnique !== 30 || event.confidence !== "complete" || event.missing?.length || event.duplicate?.length || event.mismatch?.length || event.unclassifiedCount !== 0)) errors.push("completeInvariant");
  } else if (event?.operation === "publish-day") {
    if (!Number.isInteger(event.day) || event.day < 1 || event.day > 30) errors.push("day");
    if (!["verified", "blocked", "failed", "uncertain", "cancelled"].includes(event.status)) errors.push("status");
    if (!event.result || !Number.isInteger(event.result.publishClickCount) || event.result.publishClickCount < 0 || event.result.publishClickCount > 1) errors.push("publishClickCountInvariant");
    if (event.status === "verified") {
      const expectedCanonical = `${project.githubPages.publicUrl}/day/${String(event.day).padStart(2, "0")}/`;
      if (event.result?.reasonCode !== "published"
        || event.result?.publishClickCount !== 1
        || event.result?.publicVerification !== "verified"
        || !validIthomeUrl(event.result?.articleUrl, /^\/articles\/[^/]+\/?$/)
        || typeof event.result?.title !== "string" || !event.result.title.trim()
        || event.result?.canonicalUrl !== expectedCanonical) errors.push("verifiedPublishEvidence");
    }
  } else errors.push("operation");
  return errors;
}

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== "--input") fail("Usage: write-event.mjs --input <event.json>");
const eventDirValue = process.env.ITHOME_EVENT_DIR;
if (!eventDirValue || !isAbsolute(eventDirValue)) fail("ITHOME_EVENT_DIR must be a configured absolute path");
const eventDir = resolve(eventDirValue);

let event;
try { event = JSON.parse(readFileSync(resolve(argv[1]), "utf8")); }
catch (error) { fail(`Cannot read event JSON: ${error.message}`); }
const errors = validate(event);
if (errors.length) fail(`Invalid event fields: ${errors.join(", ")}`);

let stat;
try { stat = lstatSync(eventDir); } catch { fail("ITHOME_EVENT_DIR does not exist; configure the bridge separately"); }
if (!stat.isDirectory() || stat.isSymbolicLink()) fail("ITHOME_EVENT_DIR must be a direct directory");

const safeTime = new Date(event.completedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const prefix = event.operation === "audit-drafts" ? "audit" : event.operation === "bootstrap-series" ? "bootstrap" : "publish";
const finalName = `${prefix}-${safeTime}-${event.eventId}.json`;
if (basename(finalName) !== finalName) fail("Unsafe event filename");
const tempPath = join(eventDir, `.event-${randomUUID()}.tmp`);
const finalPath = join(eventDir, finalName);

let fd;
try {
  fd = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  writeFileSync(fd, `${JSON.stringify(event, null, 2)}\n`, "utf8");
  fsyncSync(fd);
  closeSync(fd); fd = undefined;
  JSON.parse(readFileSync(tempPath, "utf8"));
  chmodSync(tempPath, 0o640);
  linkSync(tempPath, finalPath);
  unlinkSync(tempPath);
} catch (error) {
  if (fd !== undefined) closeSync(fd);
  try { unlinkSync(tempPath); } catch {}
  fail(`Failed to write event atomically: ${error.message}`);
}
process.stdout.write(`${JSON.stringify({ status: "written", path: finalPath, eventId: event.eventId })}\n`);
