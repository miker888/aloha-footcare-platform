// Prototype only: the browser end of the in-browser database (see demo/worker.js).
// Loaded on first use, so pages that never touch data never download Postgres.

import type { PGliteWorker } from "@electric-sql/pglite/worker";
import { withBase, absoluteUrl } from "@/lib/url";
import { resetCount, setDemoStatus } from "./state";

type Manifest = { version: string; files: string[] };

let dbPromise: Promise<PGliteWorker> | null = null;

async function connect(): Promise<PGliteWorker> {
  setDemoStatus("loading");
  const manifest = (await (await fetch(withBase("/demo-db/manifest.json"))).json()) as Manifest;
  const name = `aloha-demo-${manifest.version}-${resetCount()}`;
  const mod = (await import(/* webpackIgnore: true */ absoluteUrl("/demo-db/pglite/worker/index.js"))) as {
    PGliteWorker: typeof PGliteWorker;
  };
  const worker = new Worker(withBase("/demo-db/worker.js"), { type: "module", name });
  const db = await mod.PGliteWorker.create(worker, {
    id: name,
    meta: { dataDir: `idb://${name}`, files: manifest.files.map((f) => absoluteUrl(`/demo-db/sql/${f}`)) },
  });
  setDemoStatus("ready");
  void forgetOldCopies(name);
  return db;
}

/** Deletes databases left by earlier versions or by starting over. Best effort. */
async function forgetOldCopies(current: string) {
  try {
    const all = await indexedDB.databases();
    for (const d of all) {
      if (d.name && d.name.includes("aloha-demo-") && !d.name.includes(current)) indexedDB.deleteDatabase(d.name);
    }
  } catch {
    // Not supported in this browser; old copies just stay.
  }
}

export function demoDb(): Promise<PGliteWorker> {
  if (!dbPromise) {
    dbPromise = connect().catch((e) => {
      dbPromise = null;
      setDemoStatus("error");
      throw e;
    });
  }
  return dbPromise;
}
