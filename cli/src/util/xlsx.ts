import { zipStore } from "./zip.js";

export type XlsxCell = string | number | boolean | null | undefined;

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  col_widths?: number[];
  freeze?: { rows?: number; cols?: number };
  merges?: string[];
};

function sanitizeXmlText(value: string): string {
  // Excel will choke on many C0 control chars. Keep tabs/newlines, drop the rest.
  // https://www.w3.org/TR/xml/#charsets
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function excelColName(index1: number): string {
  let n = index1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellXml(ref: string, value: XlsxCell): string {
  if (value === null || value === undefined) {
    return `<c r="${ref}"/>`;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
    }
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  const text = escapeXml(value);
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const freezeRows = sheet.freeze?.rows ?? 0;
  const freezeCols = sheet.freeze?.cols ?? 0;

  let sheetViewsXml = "";
  if (freezeRows > 0 || freezeCols > 0) {
    const topLeftCell = `${excelColName(freezeCols + 1)}${freezeRows + 1}`;
    const activePane =
      freezeRows > 0 && freezeCols > 0 ? "bottomRight" : freezeRows > 0 ? "bottomLeft" : "topRight";

    const xSplit = freezeCols > 0 ? ` xSplit="${freezeCols}"` : "";
    const ySplit = freezeRows > 0 ? ` ySplit="${freezeRows}"` : "";

    sheetViewsXml =
      `<sheetViews>` +
      `<sheetView workbookViewId="0">` +
      `<pane${xSplit}${ySplit} topLeftCell="${topLeftCell}" activePane="${activePane}" state="frozen"/>` +
      `</sheetView>` +
      `</sheetViews>`;
  }

  let colsXml = "";
  if (sheet.col_widths && sheet.col_widths.length > 0) {
    const cols = sheet.col_widths
      .map((width, index0) => {
        if (!Number.isFinite(width) || width <= 0) {
          return "";
        }
        const index1 = index0 + 1;
        return `<col min="${index1}" max="${index1}" width="${width}" customWidth="1"/>`;
      })
      .filter((value) => value.length > 0)
      .join("");

    if (cols.length > 0) {
      colsXml = `<cols>${cols}</cols>`;
    }
  }

  const rowXml = sheet.rows
    .map((row, rowIndex0) => {
      const rowIndex1 = rowIndex0 + 1;
      const cells = row
        .map((value, colIndex0) => {
          const colName = excelColName(colIndex0 + 1);
          const ref = `${colName}${rowIndex1}`;
          return cellXml(ref, value);
        })
        .join("");

      return `<row r="${rowIndex1}">${cells}</row>`;
    })
    .join("");

  let mergesXml = "";
  if (sheet.merges && sheet.merges.length > 0) {
    const entries = sheet.merges.map((ref) => `<mergeCell ref="${escapeXml(ref)}"/>`).join("");
    mergesXml = `<mergeCells count="${sheet.merges.length}">${entries}</mergeCells>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${sheetViewsXml}` +
    `${colsXml}` +
    `<sheetData>${rowXml}</sheetData>` +
    `${mergesXml}` +
    `</worksheet>`;
}

function workbookXml(sheets: XlsxSheet[]): string {
  const sheetEntries = sheets
    .map((sheet, index0) => {
      const sheetId = index0 + 1;
      const rid = `rId${sheetId}`;
      return `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheetId}" r:id="${rid}"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheetEntries}</sheets>` +
    `</workbook>`;
}

function workbookRelsXml(sheets: XlsxSheet[]): string {
  const rels = sheets
    .map((_, index0) => {
      const sheetId = index0 + 1;
      return `<Relationship Id="rId${sheetId}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
        `Target="worksheets/sheet${sheetId}.xml"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${rels}` +
    `</Relationships>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ` +
    `Target="xl/workbook.xml"/>` +
    `</Relationships>`;
}

function contentTypesXml(sheets: XlsxSheet[]): string {
  const overrides = sheets
    .map((_, index0) => {
      const sheetId = index0 + 1;
      return `<Override PartName="/xl/worksheets/sheet${sheetId}.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `${overrides}` +
    `</Types>`;
}

export function writeXlsx(sheets: XlsxSheet[]): Uint8Array {
  const encoder = new TextEncoder();

  const entries = [
    {
      path: "[Content_Types].xml",
      data: encoder.encode(contentTypesXml(sheets))
    },
    {
      path: "_rels/.rels",
      data: encoder.encode(rootRelsXml())
    },
    {
      path: "xl/workbook.xml",
      data: encoder.encode(workbookXml(sheets))
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: encoder.encode(workbookRelsXml(sheets))
    },
    ...sheets.map((sheet, index0) => {
      const id = index0 + 1;
      return { path: `xl/worksheets/sheet${id}.xml`, data: encoder.encode(sheetXml(sheet)) };
    })
  ];

  return zipStore(entries);
}
