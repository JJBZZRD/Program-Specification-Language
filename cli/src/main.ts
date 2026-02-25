#!/usr/bin/env node

import { runCompileCommand } from "./commands/compile.js";
import { runExportCommand } from "./commands/export.js";
import { runMaterializeCommand } from "./commands/materialize.js";
import { runPrintCommand } from "./commands/print.js";
import { runValidateCommand } from "./commands/validate.js";

type CommandHandler = (args: string[]) => Promise<number>;

const handlers: Record<string, CommandHandler> = {
  validate: runValidateCommand,
  compile: runCompileCommand,
  materialize: runMaterializeCommand,
  print: runPrintCommand,
  export: runExportCommand
};

function printUsage(): void {
  console.log(
    "Usage: psl <validate|compile|materialize|print|export> <file> [--stdin] [--json] [--out <output-file>] [--results <results.json>]"
  );
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  const handler = command ? handlers[command] : undefined;

  if (!handler) {
    printUsage();
    return 1;
  }

  return handler(args);
}

process.exitCode = await main();
