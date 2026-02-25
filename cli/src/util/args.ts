import { readFile } from "node:fs/promises";

function toValueFlagSet(valueFlags: readonly string[]): ReadonlySet<string> {
  return new Set(valueFlags);
}

export function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

export function readFlagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

export function collectPositionals(args: readonly string[], valueFlags: readonly string[]): string[] {
  const valueFlagSet = toValueFlagSet(valueFlags);
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (valueFlagSet.has(token)) {
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      continue;
    }

    positionals.push(token);
  }

  return positionals;
}

export async function readTextFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error("No input received on stdin.");
  }

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export interface SourceInput {
  source: string;
  sourceName: string;
  fromStdin: boolean;
}

export async function readSourceInput(
  args: readonly string[],
  options: { valueFlags: readonly string[]; defaultFilename?: string }
): Promise<SourceInput> {
  const positionals = collectPositionals(args, options.valueFlags);
  const sourcePath = positionals[0];
  const forceStdin = hasFlag(args, "--stdin");

  if (forceStdin || !sourcePath) {
    const source = await readTextFromStdin();
    const filename = readFlagValue(args, "--filename");
    const sourceName = filename ?? sourcePath ?? options.defaultFilename ?? "<stdin>";
    return { source, sourceName, fromStdin: true };
  }

  const source = await readFile(sourcePath, "utf8");
  return { source, sourceName: sourcePath, fromStdin: false };
}

