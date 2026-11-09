// Runs before `next build` and `next dev`.
//
// With NEXT_PUBLIC_DEMO_MODE=true it assembles public/demo-db/: PGlite (Postgres in
// WebAssembly), the worker that hosts it, and the SQL that builds the database
// (the Supabase stand-in, every migration, the demo seed and two staff
// accounts). Without it, it removes public/demo-db/ so a real build ships none of
// this.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "demo-db");

fs.rmSync(out, { recursive: true, force: true });
if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") process.exit(0);

// PGlite: its JavaScript, the Postgres build, and the one extension we use.
const dist = path.join(root, "node_modules", "@electric-sql", "pglite", "dist");
const keep = (rel) =>
  (rel.endsWith(".js") && !rel.endsWith(".d.js")) ||
  ["pglite.wasm", "pglite.data", "initdb.wasm", "btree_gist.tar.gz"].includes(rel);
(function copy(dir) {
  for (const entry of fs.readdirSync(path.join(dist, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) copy(rel);
    else if (keep(rel)) {
      fs.mkdirSync(path.join(out, "pglite", dir), { recursive: true });
      fs.copyFileSync(path.join(dist, rel), path.join(out, "pglite", rel));
    }
  }
})("");

fs.copyFileSync(path.join(root, "demo", "worker.js"), path.join(out, "worker.js"));

// The database, in load order.
const migrations = fs
  .readdirSync(path.join(root, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => path.join("supabase", "migrations", f));
const sources = ["supabase/tests/supabase-stub.sql", ...migrations, "supabase/seed.sql", "demo/staff.sql"];

fs.mkdirSync(path.join(out, "sql"));
const hash = createHash("sha256");
const files = sources.map((src, i) => {
  const name = `${String(i).padStart(2, "0")}-${path.basename(src)}`;
  const sql = fs.readFileSync(path.join(root, src), "utf8");
  hash.update(sql);
  fs.writeFileSync(path.join(out, "sql", name), sql);
  return name;
});

// A schema change gets a fresh browser database instead of an old one.
const version = hash.digest("hex").slice(0, 12);
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ version, files }, null, 2) + "\n");
console.log(`Prototype database prepared (${files.length} SQL files, version ${version}).`);
