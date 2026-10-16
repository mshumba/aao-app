/** Direct-execution entry point; importing this module never runs the job. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { importNewSermons, readConfig } from "./nightly-sermons-core.ts";

async function main() {
  console.log(JSON.stringify(await importNewSermons(readConfig(process.env))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Nightly sermon import failed");
    process.exitCode = 1;
  });
}
