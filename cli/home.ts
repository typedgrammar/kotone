// The on-disk library shared by the app, the CLI and `pnpm dev` (Node side only).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const support = path.join(os.homedir(), "Library", "Application Support");

/** `KOTONE_HOME`, else ~/Library/Application Support/Kotone (moved from the app's former name, Utayomi). */
export function libraryHome(): string {
  if (process.env.KOTONE_HOME) return process.env.KOTONE_HOME;
  const home = path.join(support, "Kotone");
  const legacy = path.join(support, "Utayomi");
  if (!fs.existsSync(home) && fs.existsSync(legacy)) fs.renameSync(legacy, home);
  return home;
}
