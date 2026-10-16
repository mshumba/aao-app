/** Direct-execution entry point; importing this module never runs the job. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ImportError, importNewSermons, readConfig, readOptions } from "./nightly-sermons-core.ts";

async function main() {
  const options = readOptions(process.argv.slice(2));
  console.log(JSON.stringify(await importNewSermons(readConfig(process.env), options)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify(error instanceof ImportError
      ? { error: error.message, ...(error.summary ? { summary: error.summary } : {}) }
      : { error: "Nightly sermon import failed" }));
    process.exitCode = 1;
  });
}
