import { defineConfig, type Plugin } from "vite";
import ts from "typescript";
import appConfig from "./vite.config";

// This server alone instruments renders; normal dev/build output is unchanged.
function renderMeasurements(): Plugin {
  const components = new Set(["App", "StudentsView", "ScheduleView"]);
  return {
    name: "performance-render-measurements",
    enforce: "pre",
    transform(code, id) {
      if (!/\/(App|StudentsView|ScheduleView)\.tsx$/.test(id.replaceAll("\\", "/"))) return;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name && components.has(node.name.text));
      if (!component || !ts.isFunctionDeclaration(component) || !component.body || !component.name) return;
      const name = JSON.stringify(component.name.text);
      const start = component.body.getStart(source) + 1;
      // Playwright's clock replaces the Performance entry API with no-ops, so keep explicit counters.
      const instrumentation = '\n  const __benchmarkStart = performance.now();\n' +
        '  const __benchmarkCounters = (window.__benchmark ??= {});\n' +
        '  const __benchmarkMetric = (__benchmarkCounters[' + name + '] ??= { renders: 0, commits: 0, commitMs: 0 });\n' +
        '  __benchmarkMetric.renders += 1;\n' +
        '  __benchmarkLayoutEffect(() => { __benchmarkMetric.commits += 1; __benchmarkMetric.commitMs += performance.now() - __benchmarkStart; });\n';
      return { code: 'import { useLayoutEffect as __benchmarkLayoutEffect } from "react";\n' + code.slice(0, start) + instrumentation + code.slice(start), map: null };
    }
  };
}

function uploadMeasurements(): Plugin {
  return {
    name: "performance-upload-measurements",
    configureServer(server) {
      server.middlewares.use("/__benchmark/upload-probe", (request, response) => {
        let receivedBytes = 0;
        request.on("data", chunk => { receivedBytes += Buffer.byteLength(chunk); });
        request.on("end", () => {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ receivedBytes }));
        });
      });
    }
  };
}

export default defineConfig(env => {
  const config = appConfig(env);
  return {
    ...config,
    plugins: [...(config.plugins ?? []), renderMeasurements(), uploadMeasurements()],
    server: { host: "127.0.0.1", port: 5174, strictPort: true }
  };
});
