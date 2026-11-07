import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
const root = process.cwd();
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat();
}
const sources = await Promise.all((await files(path.join(root, "src"))).filter(file => /\.(ts|tsx|css)$/.test(file) && !/\.(test|spec)\.[^/]+$/.test(file) && !file.endsWith(".d.ts")).map(async file => {
  const text = await readFile(file, "utf8");
  return { file: path.relative(root, file).replaceAll("\\", "/"), lines: text.trimEnd().split(/\r?\n/).length, bytes: Buffer.byteLength(text) };
}));
const chunks = await Promise.all((await files(path.join(root, "dist"))).filter(file => /\.(js|css)$/.test(file)).map(async file => {
  const buffer = await readFile(file);
  return { file: path.relative(root, file).replaceAll("\\", "/"), bytes: (await stat(file)).size, gzipBytes: gzipSync(buffer).length };
}));
const warnings = [...sources.filter(file => file.lines > 2000).map(file => file.file + ": " + file.lines + " lines (threshold 2000)"), ...chunks.filter(file => file.bytes > 500 * 1024).map(file => file.file + ": " + file.bytes + " bytes (threshold 500 KiB)")];
const report = { sourceFiles: sources.length, productionLines: sources.reduce((sum, file) => sum + file.lines, 0), sourceLineThreshold: 2000, chunkByteThreshold: 500 * 1024, sources: sources.sort((a, b) => b.lines - a.lines), chunks: chunks.sort((a, b) => b.bytes - a.bytes), warnings };
await mkdir(path.join(root, "artifacts", "quality"), { recursive: true });
await writeFile(path.join(root, "artifacts", "quality", "size-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Production files: " + sources.length + "; lines: " + report.productionLines);
for (const warning of warnings) console.warn(process.env.GITHUB_ACTIONS ? "::warning::" + warning : "Warning: " + warning);
if (!warnings.length) console.log("All source files and chunks are within warning thresholds.");
