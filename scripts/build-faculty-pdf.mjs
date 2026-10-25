import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

app.whenReady().then(async () => {
  const mdContent = fs.readFileSync(path.join(rootDir, "docs/FACULTY_PROJECT_REPORT.md"), "utf8");

  // A clean, robust parser for our markdown report to styled HTML
  function mdToHtml(md) {
    let lines = md.split("\n");
    let html = "";
    let inTable = false;
    let inCode = false;
    let codeBuffer = "";

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code blocks
      if (line.startsWith("```")) {
        if (!inCode) {
          inCode = true;
          codeBuffer = "";
          continue;
        } else {
          inCode = false;
          html += `<pre><code>${codeBuffer.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>\n`;
          continue;
        }
      }
      if (inCode) {
        codeBuffer += line + "\n";
        continue;
      }

      // Tables
      if (line.includes("|")) {
        if (!inTable) {
          inTable = true;
          html += `<table>\n`;
          // Header row
          const cols = line.split("|").filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
          html += `<thead><tr>` + cols.map(c => `<th>${c.trim()}</th>`).join("") + `</tr></thead>\n<tbody>\n`;
          continue;
        } else if (line.includes("---")) {
          // Separator row, skip
          continue;
        } else {
          // Body row
          const cols = line.split("|").filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
          html += `<tr>` + cols.map(c => `<td>${c.trim()}</td>`).join("") + `</tr>\n`;
          continue;
        }
      } else if (inTable) {
        inTable = false;
        html += `</tbody></table>\n`;
      }

      // Headers
      if (line.startsWith("# ")) {
        html += `<h1>${line.slice(2).trim()}</h1>\n`;
      } else if (line.startsWith("## ")) {
        html += `<h2>${line.slice(3).trim()}</h2>\n`;
      } else if (line.startsWith("### ")) {
        html += `<h3>${line.slice(4).trim()}</h3>\n`;
      } else if (line.startsWith("#### ")) {
        html += `<h4>${line.slice(5).trim()}</h4>\n`;
      } else if (line.startsWith("> ")) {
        html += `<blockquote>${line.slice(2).trim()}</blockquote>\n`;
      } else if (line.startsWith("- ")) {
        // Simple list item
        let item = line.slice(2).trim();
        // Bold formatting
        item = item.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        item = item.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        item = item.replace(/`([^`]+)`/g, "<code>$1</code>");
        html += `<ul><li>${item}</li></ul>\n`;
      } else if (line.startsWith("---")) {
        html += `<hr />\n`;
      } else if (line.trim().length > 0) {
        let p = line.trim();
        p = p.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        p = p.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        p = p.replace(/`([^`]+)`/g, "<code>$1</code>");
        p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        html += `<p>${p}</p>\n`;
      }
    }
    if (inTable) html += `</tbody></table>\n`;
    return html;
  }

  const bodyHtml = mdToHtml(mdContent);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>DevDesk - Faculty Project Technical Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    
    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      line-height: 1.5;
      font-size: 11pt;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    h1 {
      font-size: 20pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 6px;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 6px;
    }

    h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 14pt;
      margin-bottom: 6pt;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }

    h3 {
      font-size: 11.5pt;
      font-weight: 600;
      color: #2563eb;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }

    h4 {
      font-size: 10.5pt;
      font-weight: 600;
      color: #334155;
      margin-top: 6pt;
      margin-bottom: 2pt;
    }

    p {
      margin-top: 0;
      margin-bottom: 6pt;
    }

    blockquote {
      background: #f8fafc;
      border-left: 4px solid #3b82f6;
      margin: 8pt 0;
      padding: 6pt 12pt;
      font-size: 10pt;
      color: #475569;
      border-radius: 0 4px 4px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }

    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      text-align: left;
      padding: 6pt 8pt;
      border: 1px solid #cbd5e1;
    }

    td {
      padding: 5pt 8pt;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background: #f8fafc;
    }

    ul {
      margin: 0 0 6pt 0;
      padding-left: 18pt;
    }

    li {
      margin-bottom: 3pt;
    }

    code {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 9pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1.5pt 3pt;
      border-radius: 3pt;
      border: 1px solid #e2e8f0;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 8pt 10pt;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5pt;
      line-height: 1.35;
      overflow-x: auto;
      margin: 8pt 0;
      page-break-inside: avoid;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      border: none;
    }

    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 12pt 0;
    }

    a {
      color: #2563eb;
      text-decoration: none;
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 8.5pt;
      font-weight: 600;
      border-radius: 4px;
      background: #dbeafe;
      color: #1e40af;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  const htmlPath = path.join(rootDir, "docs/DevDesk_Faculty_Project_Report.html");
  fs.writeFileSync(htmlPath, fullHtml);

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    webPreferences: {
      nodeIntegration: false
    }
  });

  await win.loadURL(`file://${htmlPath}`);

  // Wait for fonts to settle
  await new Promise(r => setTimeout(r, 1000));

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    margins: {
      top: 0.4,
      bottom: 0.4,
      left: 0.4,
      right: 0.4
    }
  });

  const pdfPath = path.join(rootDir, "docs/DevDesk_Faculty_Project_Report.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`[SUCCESS] PDF generated at: ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`[SUCCESS] HTML generated at: ${htmlPath}`);

  app.quit();
});
