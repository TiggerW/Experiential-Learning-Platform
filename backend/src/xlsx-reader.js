const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

function colToIndex(col) {
  let index = 0;
  for (let i = 0; i < col.length; i += 1) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseCellRef(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref || "");
  if (!match) return { row: 0, col: 0 };
  return { row: Number(match[2]) - 1, col: colToIndex(match[1]) };
}

function readXlsxRows(filePath) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(filePath);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  const sharedEntry = zip.getEntry("xl/sharedStrings.xml");
  const sharedStrings = [];
  if (sharedEntry) {
    const sharedXml = parser.parse(sharedEntry.getData().toString("utf8"));
    const items = sharedXml?.sst?.si || [];
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) {
      if (typeof item === "string") {
        sharedStrings.push(item);
      } else if (item.t !== undefined) {
        sharedStrings.push(String(item.t));
      } else if (item.r) {
        const runs = Array.isArray(item.r) ? item.r : [item.r];
        sharedStrings.push(runs.map((run) => String(run.t || "")).join(""));
      } else {
        sharedStrings.push("");
      }
    }
  }

  const sheetEntry =
    zip.getEntry("xl/worksheets/sheet1.xml") || zip.getEntries().find((e) => e.entryName.startsWith("xl/worksheets/sheet"));
  if (!sheetEntry) return [];

  const sheetXml = parser.parse(sheetEntry.getData().toString("utf8"));
  const rowNodes = sheetXml?.worksheet?.sheetData?.row || [];
  const rows = Array.isArray(rowNodes) ? rowNodes : [rowNodes];
  const matrix = [];

  for (const row of rows) {
    const cells = row.c ? (Array.isArray(row.c) ? row.c : [row.c]) : [];
    for (const cell of cells) {
      const { row: rowIndex, col: colIndex } = parseCellRef(cell["@_r"]);
      if (!matrix[rowIndex]) matrix[rowIndex] = [];
      let value = "";
      if (cell["@_t"] === "s") {
        value = sharedStrings[Number(cell.v)] || "";
      } else if (cell.v !== undefined) {
        value = String(cell.v);
      }
      matrix[rowIndex][colIndex] = value;
    }
  }

  return matrix
    .filter((row) => row && row.some((cell) => String(cell || "").trim()))
    .map((row) => {
      const maxCol = Math.max(...row.map((_, idx) => idx), row.length - 1);
      const normalized = [];
      for (let i = 0; i <= maxCol; i += 1) normalized.push(row[i] || "");
      return normalized;
    });
}

function cellValueToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (value.t !== undefined) return String(value.t).trim();
    if (value.r) {
      const runs = Array.isArray(value.r) ? value.r : [value.r];
      return runs.map((run) => String(run.t || "")).join("").trim();
    }
    if (Array.isArray(value)) return value.map(cellValueToString).filter(Boolean).join(" ").trim();
  }
  const text = String(value).trim();
  if (text === "[object Object]") return "";
  return text;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) obj[header] = cellValueToString(row[index]);
    });
    return obj;
  });
}

function readXlsxObjects(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return rowsToObjects(readXlsxRows(filePath));
}

function findDatasetFile(baseDir, relativeCandidates) {
  for (const relative of relativeCandidates) {
    const fullPath = path.join(baseDir, relative);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

module.exports = {
  readXlsxRows,
  readXlsxObjects,
  findDatasetFile,
  cellValueToString,
};
