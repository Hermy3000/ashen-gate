import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: with-app-env.mjs <cmd> [...args]");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cmd = args[0];
const rest = args.slice(1);
const binName = process.platform === "win32" ? `${cmd}.cmd` : cmd;
const localBin = path.join(root, "node_modules", ".bin", binName);
const child = spawn(localBin, rest, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
