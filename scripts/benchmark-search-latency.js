const fs = require('fs/promises');
const path = require('path');
const Papa = require('papaparse');

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildCell() {
  const pool = [
    'alpha',
    'beta',
    'gamma',
    'delta',
    'omega',
    'lorem',
    'ipsum',
    'value',
    'entry',
    'asset',
    'localization',
    'text',
    'data'
  ];
  const a = randomFrom(pool);
  const b = randomFrom(pool);
  return `${a}_${b}_${Math.floor(Math.random() * 10000)}`;
}

async function ensureDataset(rootDir, fileCount, rowCount, colCount) {
  await fs.rm(rootDir, { recursive: true, force: true });
  await fs.mkdir(rootDir, { recursive: true });

  const header = Array.from({ length: colCount }, (_, i) => `col_${i}`);
  const writeTasks = [];

  for (let f = 0; f < fileCount; f += 1) {
    const lines = [header.join(',')];
    for (let r = 0; r < rowCount; r += 1) {
      const row = [];
      row.push(`KEY_${f}_${r}`);
      for (let c = 1; c < colCount; c += 1) {
        row.push(buildCell());
      }
      lines.push(row.map((v) => `"${v}"`).join(','));
    }
    const filePath = path.join(rootDir, `bench_${String(f).padStart(3, '0')}.csv`);
    writeTasks.push(fs.writeFile(filePath, lines.join('\n'), 'utf8'));
  }

  await Promise.all(writeTasks);
}

async function scanCSVFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.csv'))
    .map((e) => {
      const p = path.join(dir, e.name);
      return { id: Buffer.from(p).toString('base64'), filePath: p };
    });
}

async function readFileAndParse(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const parseResult = Papa.parse(content, { skipEmptyLines: true });
  const rows = parseResult.data.slice(1).map((cells, index) => ({
    rowIndex: index,
    cells,
    key: cells[0] || ''
  }));
  return rows;
}

async function runSearch(projectPath, query, isCaseSensitive = false, maxResults = Number.POSITIVE_INFINITY) {
  const t0 = nowMs();
  const files = await scanCSVFiles(projectPath);
  const t1 = nowMs();

  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = isCaseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, flags);

  let readParseMs = 0;
  let matchMs = 0;
  const results = [];

  let hasMore = false;
  outerLoop:
  for (const file of files) {
    const r0 = nowMs();
    const rows = await readFileAndParse(file.filePath);
    const r1 = nowMs();
    readParseMs += r1 - r0;

    const m0 = nowMs();
    for (const row of rows) {
      for (let colIndex = 0; colIndex < row.cells.length; colIndex += 1) {
        const cell = row.cells[colIndex];
        if (!cell) continue;
        regex.lastIndex = 0;
        if (!regex.test(cell)) continue;
        results.push({
          fileId: file.id,
          rowIndex: row.rowIndex,
          colIndex,
          key: row.key,
          context: cell.length > 50 ? `${cell.slice(0, 50)}...` : cell
        });

        if (results.length >= maxResults) {
          hasMore = true;
          break outerLoop;
        }
      }
    }
    const m1 = nowMs();
    matchMs += m1 - m0;
  }

  const g0 = nowMs();
  const grouped = {};
  for (const item of results) {
    if (!grouped[item.fileId]) grouped[item.fileId] = [];
    grouped[item.fileId].push(item);
  }
  const g1 = nowMs();

  const s0 = nowMs();
  const payload = JSON.stringify(results);
  const s1 = nowMs();

  const t2 = nowMs();
  return {
    query,
    maxResults: Number.isFinite(maxResults) ? maxResults : null,
    hasMore,
    files: files.length,
    results: results.length,
    scanMs: t1 - t0,
    readParseMs,
    matchMs,
    groupMs: g1 - g0,
    serializeMs: s1 - s0,
    payloadMB: Buffer.byteLength(payload, 'utf8') / (1024 * 1024),
    totalMs: t2 - t0
  };
}

async function runSearchStreamSim(projectPath, query, isCaseSensitive = false, maxResults = Number.POSITIVE_INFINITY, chunkSize = 200) {
  const t0 = nowMs();
  const files = await scanCSVFiles(projectPath);
  const t1 = nowMs();

  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = isCaseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, flags);

  let readParseMs = 0;
  let matchMs = 0;
  let serializeMs = 0;
  let resultsCount = 0;
  let hasMore = false;
  let chunks = 0;
  let ttfrMs = -1;
  let chunkBuffer = [];

  const flushChunk = () => {
    if (chunkBuffer.length === 0) return;
    const s0 = nowMs();
    const payload = JSON.stringify(chunkBuffer);
    const s1 = nowMs();
    serializeMs += s1 - s0;
    if (ttfrMs < 0) {
      ttfrMs = s1 - t0;
    }
    // Simulate renderer consumption cost.
    JSON.parse(payload);
    chunks += 1;
    chunkBuffer = [];
  };

  outerLoop:
  for (const file of files) {
    const r0 = nowMs();
    const rows = await readFileAndParse(file.filePath);
    const r1 = nowMs();
    readParseMs += r1 - r0;

    const m0 = nowMs();
    for (const row of rows) {
      for (let colIndex = 0; colIndex < row.cells.length; colIndex += 1) {
        const cell = row.cells[colIndex];
        if (!cell) continue;
        regex.lastIndex = 0;
        if (!regex.test(cell)) continue;
        chunkBuffer.push({
          fileId: file.id,
          rowIndex: row.rowIndex,
          colIndex,
          key: row.key,
          context: cell.length > 50 ? `${cell.slice(0, 50)}...` : cell
        });
        resultsCount += 1;

        if (chunkBuffer.length >= chunkSize) {
          flushChunk();
        }

        if (resultsCount >= maxResults) {
          hasMore = true;
          break outerLoop;
        }
      }
    }
    const m1 = nowMs();
    matchMs += m1 - m0;
  }

  flushChunk();
  const t2 = nowMs();
  return {
    query,
    mode: 'stream-sim',
    maxResults: Number.isFinite(maxResults) ? maxResults : null,
    hasMore,
    files: files.length,
    results: resultsCount,
    chunks,
    ttfrMs: ttfrMs < 0 ? t2 - t0 : ttfrMs,
    scanMs: t1 - t0,
    readParseMs,
    matchMs,
    serializeMs,
    totalMs: t2 - t0
  };
}

function printReport(report) {
  const capLabel = report.maxResults ? `, cap=${report.maxResults}` : '';
  const moreLabel = report.hasMore ? ', truncated=true' : '';
  console.log(`\n[Query="${report.query}"${capLabel}]`);
  console.log(`files=${report.files}, results=${report.results}${moreLabel}, payload=${report.payloadMB.toFixed(2)} MB`);
  console.log(`scan=${report.scanMs.toFixed(1)} ms`);
  console.log(`read+parse=${report.readParseMs.toFixed(1)} ms`);
  console.log(`match=${report.matchMs.toFixed(1)} ms`);
  console.log(`group(frontend memo)=${report.groupMs.toFixed(1)} ms`);
  console.log(`serialize(ipc payload)=${report.serializeMs.toFixed(1)} ms`);
  console.log(`TOTAL=${report.totalMs.toFixed(1)} ms`);
}

function printStreamReport(report) {
  const capLabel = report.maxResults ? `, cap=${report.maxResults}` : '';
  const moreLabel = report.hasMore ? ', truncated=true' : '';
  console.log(`\n[Query="${report.query}"${capLabel}, mode=${report.mode}]`);
  console.log(`files=${report.files}, results=${report.results}${moreLabel}, chunks=${report.chunks}`);
  console.log(`TTFR(first chunk)=${report.ttfrMs.toFixed(1)} ms`);
  console.log(`scan=${report.scanMs.toFixed(1)} ms`);
  console.log(`read+parse=${report.readParseMs.toFixed(1)} ms`);
  console.log(`match=${report.matchMs.toFixed(1)} ms`);
  console.log(`serialize(all chunks)=${report.serializeMs.toFixed(1)} ms`);
  console.log(`TOTAL=${report.totalMs.toFixed(1)} ms`);
}

async function main() {
  const fileCount = Number(process.argv[2] || 40);
  const rowCount = Number(process.argv[3] || 1000);
  const colCount = Number(process.argv[4] || 8);
  const baseDir = path.resolve(process.cwd(), '.perf-search-data');

  console.log(`Generating dataset: files=${fileCount}, rows/file=${rowCount}, cols=${colCount}`);
  await ensureDataset(baseDir, fileCount, rowCount, colCount);

  const q1 = await runSearch(baseDir, 'a');
  const q2 = await runSearch(baseDir, 'alpha');
  const q1Capped = await runSearch(baseDir, 'a', false, 2000);
  const q2Capped = await runSearch(baseDir, 'alpha', false, 2000);
  const q1CappedStream = await runSearchStreamSim(baseDir, 'a', false, 2000, 200);
  const q2CappedStream = await runSearchStreamSim(baseDir, 'alpha', false, 2000, 200);

  printReport(q1);
  printReport(q2);
  printReport(q1Capped);
  printReport(q2Capped);
  printStreamReport(q1CappedStream);
  printStreamReport(q2CappedStream);

  const ratio = q2.totalMs > 0 ? q1.totalMs / q2.totalMs : 0;
  console.log(`\nFirst-char slowdown ratio (a vs alpha): ${ratio.toFixed(2)}x`);
  const ttfrGain = q1Capped.totalMs > 0 ? q1Capped.totalMs / q1CappedStream.ttfrMs : 0;
  console.log(`Capped query \"a\" first visible result gain (full-return TOTAL vs stream TTFR): ${ttfrGain.toFixed(2)}x`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
