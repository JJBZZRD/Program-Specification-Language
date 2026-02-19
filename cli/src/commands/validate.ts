import { readFile } from "node:fs/promises";
import { parseDocument, validateAst } from "../../../src/index.js";

export async function runValidateCommand(args: string[]): Promise<number> {
  const [filePath] = args;

  if (!filePath) {
    console.error("Usage: psl validate <file>");
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

  const result = validateAst(ast);

  if (result.valid) {
    console.log("Validation passed.");
    return 0;
  }

  result.diagnostics.forEach((diagnostic) => {
    console.error(`[${diagnostic.severity}] ${diagnostic.path}: ${diagnostic.message}`);
  });

  return 1;
}
