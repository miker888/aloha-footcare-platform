// Prototype only. Runs the real database (schema, security rules and demo data)
// in the browser with PGlite, a WebAssembly build of Postgres. Saved in the
// browser's IndexedDB so bookings survive page loads. Shared by every open tab:
// one tab's worker holds the database and the others talk to it.
//
// Copied to public/demo-db/worker.js by demo/prepare.mjs, next to the PGlite files.

import { PGlite } from "./pglite/index.js";
import { worker } from "./pglite/worker/index.js";
import { btree_gist } from "./pglite/contrib/btree_gist.js";

worker({
  async init(options) {
    const { dataDir, files } = options.meta;
    let db;
    try {
      db = await PGlite.create({ dataDir, extensions: { btree_gist } });
    } catch {
      // No IndexedDB (some private windows): keep it in memory for this page.
      db = await PGlite.create({ extensions: { btree_gist } });
    }
    // Supabase runs in UTC; the app converts to Calgary time itself.
    await db.exec("set timezone = 'UTC'");

    const { rows } = await db.query("select to_regclass('demo_meta.ready') is not null as ready");
    if (!rows[0].ready) {
      const parts = await Promise.all(files.map(async (f) => (await fetch(f)).text()));
      // One transaction, so a tab closed halfway leaves nothing behind.
      await db.exec(
        ["begin;", ...parts, "create schema demo_meta; create table demo_meta.ready (at timestamptz default now()); insert into demo_meta.ready default values;", "commit;"].join("\n"),
      );
    }
    return db;
  },
});
