/**
 * Generates public/downloads/micstage-open-mic-sign-up-sheet.pdf
 * Letter portrait, no ads/affiliates/personal info. Brand: MicStage + micstage.com only.
 *
 * Usage: node scripts/generate-open-mic-signup-sheet-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "downloads", "micstage-open-mic-sign-up-sheet.pdf");

/** Escape PDF string literals (WinAnsi subset we emit). */
function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf() {
  // Letter: 612 x 792 pt
  const W = 612;
  const H = 792;
  const marginX = 40;
  const contentW = W - marginX * 2;

  const ops = [];
  const move = (x, y) => ops.push(`${x.toFixed(2)} ${y.toFixed(2)} m`);
  const line = (x, y) => ops.push(`${x.toFixed(2)} ${y.toFixed(2)} l`);
  const stroke = () => ops.push("S");
  const fill = () => ops.push("f");
  const rect = (x, y, w, h) => ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
  const setStroke = (g = 0) => ops.push(`${g} G`);
  const setFill = (g = 0) => ops.push(`${g} g`);
  const setLw = (w) => ops.push(`${w} w`);

  // Soft header band
  setFill(0.96);
  rect(0, H - 88, W, 88);
  fill();

  setStroke(0.75);
  setLw(0.6);
  move(0, H - 88);
  line(W, H - 88);
  stroke();

  // Accent rule under brand
  setStroke(0.15);
  setLw(2);
  move(marginX, H - 86);
  line(marginX + 120, H - 86);
  stroke();

  // Table geometry
  const tableTop = H - 210;
  const rowH = 28;
  const rows = 18;
  const colX = [
    marginX, // #
    marginX + 36, // name
    marginX + 300, // set length
    marginX + 372, // notes
    marginX + contentW, // right
  ];

  // Outer table
  setStroke(0.2);
  setLw(1);
  rect(marginX, tableTop - rows * rowH, contentW, rows * rowH);
  stroke();

  // Header row fill
  setFill(0.92);
  rect(marginX, tableTop - rowH, contentW, rowH);
  fill();

  // Grid
  setStroke(0.55);
  setLw(0.5);
  for (let r = 1; r <= rows; r++) {
    const y = tableTop - r * rowH;
    move(marginX, y);
    line(marginX + contentW, y);
    stroke();
  }
  for (let c = 1; c < colX.length - 1; c++) {
    move(colX[c], tableTop);
    line(colX[c], tableTop - rows * rowH);
    stroke();
  }

  // Meta field underlines
  const metaY = [H - 118, H - 148, H - 178];
  setStroke(0.45);
  setLw(0.7);
  for (const y of metaY) {
    move(marginX + 72, y - 2);
    line(marginX + 300, y - 2);
    stroke();
    move(marginX + 360, y - 2);
    line(marginX + contentW, y - 2);
    stroke();
  }

  // Footer rule
  setStroke(0.7);
  setLw(0.6);
  move(marginX, 64);
  line(marginX + contentW, 64);
  stroke();

  const streamBody = ops.join("\n") + "\n";

  // Text layer (separate BT blocks for clarity)
  const textOps = [];
  const t = (size, x, y, str, font = "F1") => {
    textOps.push("BT");
    textOps.push(`/${font} ${size} Tf`);
    textOps.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    textOps.push(`(${esc(str)}) Tj`);
    textOps.push("ET");
  };

  t(20, marginX, H - 36, "MicStage", "F2");
  t(11, marginX, H - 54, "Open mic sign-up sheet", "F2");
  t(9, marginX, H - 68, "Free printable list for hosts  ·  micstage.com", "F1");
  t(8, W - marginX - 118, H - 36, "micstage.com", "F1");

  t(9, marginX, H - 118, "Venue:", "F1");
  t(9, marginX + 310, H - 118, "Date:", "F1");
  t(9, marginX, H - 148, "Night / format:", "F1");
  t(9, marginX + 310, H - 148, "Host:", "F1");
  t(9, marginX, H - 178, "Default set length:", "F1");
  t(9, marginX + 310, H - 178, "Signup closes:", "F1");

  // Column headers (vertically centered-ish in header row)
  const hdrY = tableTop - 18;
  t(9, colX[0] + 10, hdrY, "#", "F2");
  t(9, colX[1] + 6, hdrY, "Performer / stage name", "F2");
  t(9, colX[2] + 6, hdrY, "Set length", "F2");
  t(9, colX[3] + 6, hdrY, "Notes", "F2");

  // Row numbers
  for (let i = 1; i < rows; i++) {
    const y = tableTop - (i + 1) * rowH + 10;
    t(9, colX[0] + 10, y, String(i), "F1");
  }

  t(8, marginX, 48, "Paper tip: one list, one host, one cutoff. Duplicate clipboards cause arguments.", "F1");
  t(8, marginX, 34, "Go paperless free: claim your venue on MicStage, publish slots, and let performers reserve online — micstage.com/host", "F1");
  t(7, marginX, 18, "No registration required for this sheet. No ads. Branding: MicStage · micstage.com", "F1");

  const content = streamBody + textOps.join("\n") + "\n";
  const contentLen = Buffer.byteLength(content, "utf8");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n",
  );
  objects.push(`4 0 obj\n<< /Length ${contentLen} >>\nstream\n${content}endstream\nendobj\n`);
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buildPdf());
console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
