// The project registry: every project you review, so one `clickthrough serve`
// shows all of them. Stored in ~/.config/clickthrough/projects.json (override
// the folder with $CLICKTHROUGH_HOME). Deliberately not ~/.clickthrough, which
// is what a project's own flows folder is called. A project is just a name and the folder that
// holds its flows; the flows themselves stay in that project.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { UserError, assertId } from "./store.mjs";

const configDir = () => process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");

export function registryFile() {
  const home = process.env.CLICKTHROUGH_HOME || process.env.FLOW_REVIEWS_HOME || path.join(configDir(), "clickthrough");
  return path.join(home, "projects.json");
}

/** Pre-rename registry (the tool used to be called Flow Reviews). */
function legacyRegistryFile() {
  if (process.env.CLICKTHROUGH_HOME || process.env.FLOW_REVIEWS_HOME) return null;
  return path.join(configDir(), "flow-reviews", "projects.json");
}

export async function readProjects() {
  // First run after the rename: carry the old project list over once.
  const legacy = legacyRegistryFile();
  if (legacy) {
    try {
      await fs.access(registryFile());
    } catch {
      try {
        const old = await fs.readFile(legacy, "utf8");
        await fs.mkdir(path.dirname(registryFile()), { recursive: true });
        await fs.writeFile(registryFile(), old);
      } catch {
        /* no old registry either */
      }
    }
  }
  try {
    const data = JSON.parse(await fs.readFile(registryFile(), "utf8"));
    return Array.isArray(data.projects) ? data.projects : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeProjects(projects) {
  const file = registryFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ projects }, null, 2) + "\n");
  await fs.rename(tmp, file);
}

/** A readable default id for a flows folder: its project folder's name. */
export function defaultProjectId(dir) {
  const abs = path.resolve(dir);
  const base = path.basename(abs).replace(/^\./, "");
  // ./.clickthrough (or the old ./.flow-reviews) -> the folder that contains it; anything else -> itself.
  const name = base === "clickthrough" || base === "flow-reviews" ? path.basename(path.dirname(abs)) : path.basename(abs);
  return slug(name) || "project";
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * Register a flows folder. Re-adding the same folder updates its name; an id
 * already used by another folder gets a numeric suffix when it was derived, and
 * is refused when it was asked for explicitly.
 */
export async function addProject({ dir, id, name }) {
  const abs = path.resolve(dir);
  const projects = await readProjects();
  const existing = projects.find((p) => p.dir === abs);
  if (existing) {
    if (name) existing.name = name;
    await writeProjects(projects);
    return existing;
  }
  let pid = id ? assertId("project", slug(id) || id) : defaultProjectId(abs);
  if (projects.some((p) => p.id === pid)) {
    if (id) throw new UserError(`A project called "${pid}" already exists (${projects.find((p) => p.id === pid).dir}).`);
    let n = 2;
    while (projects.some((p) => p.id === `${pid}-${n}`)) n++;
    pid = `${pid}-${n}`;
  }
  const project = { id: pid, name: name || pid, dir: abs };
  projects.push(project);
  await writeProjects(projects);
  return project;
}

export async function removeProject(id) {
  const projects = await readProjects();
  const next = projects.filter((p) => p.id !== id);
  if (next.length === projects.length) throw new UserError(`No project "${id}".`, 404);
  await writeProjects(next);
  return next;
}

export async function findProject(id) {
  const p = (await readProjects()).find((x) => x.id === id);
  if (!p) throw new UserError(`No project "${id}". See \`clickthrough projects\`.`, 404);
  return p;
}
