import { parse } from "yaml";

export function parseDocument(source: string): unknown {
  return parse(source);
}
