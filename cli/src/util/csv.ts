export type CsvCell = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = typeof value === "string" ? value : String(value);
  const mustQuote = /[",\r\n]/.test(text);
  const escaped = text.replace(/"/g, '""');

  return mustQuote ? `"${escaped}"` : escaped;
}

export function encodeCsv(columns: string[], rows: CsvCell[][]): string {
  const lines: string[] = [];
  lines.push(columns.map(escapeCsvCell).join(","));

  rows.forEach((row) => {
    const line = columns.map((_, index) => escapeCsvCell(row[index])).join(",");
    lines.push(line);
  });

  return `${lines.join("\n")}\n`;
}

