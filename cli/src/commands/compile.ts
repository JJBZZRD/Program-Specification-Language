import { readFile, writeFile } from "node:fs/promises";
import { compileProgram, parseDocument, validateAst } from "../../../src/index.js";

function readOutputPath(args: string[]): string | undefined {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1) {
    return undefined;
  }

  return args[outIndex + 1];
}

export async function runCompileCommand(args: string[]): Promise<number> {
  const [filePath] = args;

  if (!filePath) {
    console.error("Usage: psl compile <file> [--out <output-file>]");
    return 1;
  }

  const source = await readFile(filePath, "utf8");

  let ast: unknown;
  try {
    ast = parseDocument(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Invalid YAML: ${message}`);
    return 1;
  }

  const validation = validateAst(ast);

  if (!validation.valid) {
    validation.diagnostics.forEach((diagnostic) => {
      console.error(`[${diagnostic.severity}] ${diagnostic.path}: ${diagnostic.message}`);
    });
    return 1;
  }

  if (!validation.value) {
    console.error("[error] $: Validation succeeded but no program value was produced.");
    return 1;
  }

  const compiled = compileProgram(validation.value);
  const output = `${JSON.stringify(compiled, null, 2)}\n`;

  const outFile = readOutputPath(args);
  if (outFile) {
    await writeFile(outFile, output, "utf8");
    console.log(`Wrote compiled output to ${outFile}`);
    return 0;
  }

  process.stdout.write(output);
  return 0;
}
