export function isMigrationFile(name) {
  return typeof name === "string" && /\.(sql|mjs|js)$/i.test(name) && !name.startsWith(".");
}

export function pendingMigrations(paths, done) {
  const doneSet = new Set(done ?? []);
  return (paths ?? [])
    .map((p) => {
      const base = String(p).split(/[\\/]/).pop() ?? String(p);
      const name = base.replace(/\.(sql|mjs|js)$/i, "");
      return { name, path: p };
    })
    .filter((m) => m.name && !doneSet.has(m.name));
}
