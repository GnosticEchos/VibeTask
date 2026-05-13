/**
 * Normalizes prisma/DATADUMP CSVs for restore-from-dump.ts (line-based parser):
 * - Parses RFC-style quoted fields including embedded newlines
 * - tasks: sort by id ascending; break 1↔2 relation cycle (clear relation on task 1)
 * - task_comments: flatten newlines inside content to spaces
 *
 * Run: node prisma/scripts/normalize-datadump-csv.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DUMP = path.join(__dirname, '..', 'DATADUMP');

function parseCSV(content) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r' && content[i + 1] === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '') || row.length > 1) rows.push(row);
      row = [];
      i += 2;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '') || row.length > 1) rows.push(row);
      row = [];
      i++;
      continue;
    }
    if (c === '\r') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '') || row.length > 1) rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

function escapeField(f) {
  const s = f == null ? '' : String(f);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToObjects(rows) {
  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, idx) => {
      o[h] = r[idx] ?? '';
    });
    return o;
  });
}

function writeCSV(filePath, headers, objects) {
  const lines = [headers.join(',')];
  for (const obj of objects) {
    lines.push(headers.map((h) => escapeField(obj[h] ?? '')).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

// --- tasks.csv ---
const tasksPath = path.join(DUMP, 'tasks.csv');
const taskRows = parseCSV(fs.readFileSync(tasksPath, 'utf-8'));
const taskHeaders = taskRows[0];
let tasks = rowsToObjects(taskRows);

for (const t of tasks) {
  if (t.id === '1') {
    t.relationMode = '';
    t.relationId = '';
  }
  // restore-from-dump splits on commas without RFC multiline; spaces in relationMode break columns
  if (t.relationMode) {
    t.relationMode = t.relationMode.trim().replace(/\s+/g, '-').toLowerCase();
  }
  // restore-from-dump parseCSV splits on newlines first; flatten text fields
  for (const key of ['name', 'description']) {
    if (t[key]) {
      t[key] = t[key].replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
}

tasks.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
writeCSV(tasksPath, taskHeaders, tasks);
console.log(`Wrote ${tasks.length} tasks (sorted by id, task 1 relation cleared)`);

// --- task_comments.csv ---
const commentsPath = path.join(DUMP, 'task_comments.csv');
const commentRows = parseCSV(fs.readFileSync(commentsPath, 'utf-8'));
const commentHeaders = commentRows[0];
let comments = rowsToObjects(commentRows);
for (const c of comments) {
  if (c.content) {
    c.content = c.content.replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
comments.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
writeCSV(commentsPath, commentHeaders, comments);
console.log(`Wrote ${comments.length} comments (newlines flattened, sorted by id)`);
