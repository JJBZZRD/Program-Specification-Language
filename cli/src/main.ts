#!/usr/bin/env node

import { runCompileCommand } from "./commands/compile.js";
import { runPrintCommand } from "./commands/print.js";
import { runValidateCommand } from "./commands/validate.js";

type CommandHandler = (args: string[]) => Promise<number>;

const handlers: Record<string, CommandHandler> = {
  validate: runValidateCommand,
  compile: runCompileCommand,
  print: runPrintCommand
};

function printUsage(): void {
  console.log("Usage: psl <validate|compile|print> <file> [--out <output-file>]");
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
