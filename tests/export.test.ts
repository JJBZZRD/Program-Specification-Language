import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileProgram } from "../src/compile/compileProgram.js";
import { materialize } from "../src/compile/materialize.js";
import { parseDocument } from "../src/parse/parseDocument.js";
import { validateAst } from "../src/validate/validateAst.js";
import { buildClientTable, buildExportTables } from "../cli/src/commands/export.js";
import { encodeCsv } from "../cli/src/util/csv.js";
import { writeXlsx } from "../cli/src/util/xlsx.js";

export async function run(): Promise<void> {
  const source = await readFile("examples/blocks_demo.psl.yaml", "utf8");
  const ast = parseDocument(source);
  const validation = validateAst(ast);

  assert.equal(validation.valid, true);
  assert.ok(validation.value);

  const compiled = compileProgram(validation.value);
  const sessions = materialize(compiled);

  const tables = buildExportTables(compiled, sessions);
  const client = buildClientTable(compiled, sessions);

  // 4w + 1w blocks => 35 days, starting 2026-03-02.
  assert.equal(tables.calendar.rows.length, 35);
  assert.equal(tables.calendar.rows[0]?.[0], "2026-03-02");
  assert.equal(tables.calendar.rows.at(-1)?.[0], "2026-04-05");

  const firstDaySummary = String(tables.calendar.rows[0]?.[5] ?? "");
  assert.ok(firstDaySummary.includes("accumulation.bench"));

  // Expected total set rows across all materialized sessions.
  assert.equal(tables.sets.rows.length, 82);

  const csv = encodeCsv(tables.sets.columns, tables.sets.rows);
  assert.ok(csv.startsWith("date_iso,weekday,day,week"));
  assert.ok(csv.includes("2026-03-02"));
  assert.ok(csv.includes("accumulation.bench"));

  assert.equal(client.columns.join(","), "date_iso,weekday,week,block,session,exercise,prescription,rest");
  assert.equal(client.rows.length, 43);
  assert.deepStrictEqual(client.rows[0], [
    "2026-03-02",
    "MON",
    1,
    "accumulation",
    "Bench (Volume)",
    "Barbell Bench Press",
    "5x5 @100kg",
    undefined
  ]);
  assert.equal(client.rows.at(-1)?.[0], "2026-04-05");
  assert.equal(client.rows.at(-1)?.[4], "REST");

  const xlsx = writeXlsx([
    { name: "Program", rows: [client.columns, ...client.rows], freeze: { rows: 1 } },
    { name: "Calendar", rows: [tables.calendar.columns, ...tables.calendar.rows] },
    { name: "Sets", rows: [tables.sets.columns, ...tables.sets.rows] }
  ]);

  assert.equal(Buffer.from(xlsx).subarray(0, 2).toString("ascii"), "PK");
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("xl/worksheets/sheet1.xml")));
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("xl/worksheets/sheet2.xml")));
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("xl/worksheets/sheet3.xml")));
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("Program")));
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("Calendar")));
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("Sets")));
  assert.ok(Buffer.from(xlsx).includes(Buffer.from("2026-03-02")));
}
