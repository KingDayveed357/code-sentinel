// src/modules/scans/pipeline/steps/run-scanners.ts
// Step: Execute security scanners

import type { FastifyInstance } from "fastify";
import { ScannerOrchestrator } from "../../../../scanners/orchestrator";
import type { ProgressTracker } from "../utils/progress";
import type { ScanLogger } from "./fetch-code"; // Re-use ScanLogger type

export async function runScanners(
  fastify: FastifyInstance,
  scanId: string,
  workspacePath: string,
  enabledScanners: any,
  commitHash: string,
  log: ScanLogger,
  progress: ProgressTracker,
  scanType?: 'quick' | 'full'
): Promise<any> {
  await log("info", "Starting security scanners", {
    enabled: Object.keys(enabledScanners).filter(
      (k) => enabledScanners[k as keyof typeof enabledScanners]
    ),
  });

  await progress.emit("scanning", "Scanner execution starting");

  const orchestrator = new ScannerOrchestrator(fastify);
  const activeScannersQueue: string[] = [];
  let completedScanners = 0;

  orchestrator.setProgressCallback(
    async (scannerName: string, phase: "start" | "complete") => {
      if (phase === "start") {
        activeScannersQueue.push(scannerName);
        await progress.updateScannerProgress(
          Object.keys(enabledScanners).filter(
            (k) => enabledScanners[k as keyof typeof enabledScanners]
          ),
          completedScanners,
          scannerName,
          Date.now() // Note: totalDuration is approximated here
        );
      } else {
        completedScanners++;
        const idx = activeScannersQueue.indexOf(scannerName);
        if (idx !== -1) activeScannersQueue.splice(idx, 1);
        
        await progress.updateScannerProgress(
          Object.keys(enabledScanners).filter(
            (k) => enabledScanners[k as keyof typeof enabledScanners]
          ),
          completedScanners,
          activeScannersQueue[0] || "complete",
          Date.now()
        );
      }
    }
  );

  const scanResults = await orchestrator.scanAll(
    workspacePath,
    scanId,
    enabledScanners,
    commitHash,
    scanType
  );

  await progress.emit(
    "scanner_complete",
    `All scanners completed (${scanResults.results.length} scanners ran)`
  );

  return scanResults;
}

export function calculateScanMetrics(scanResults: any) {
  const metrics = {
    semgrepDuration: 0,
    osvDuration: 0,
    gitleaksDuration: 0,
    checkovDuration: 0,
    trivyDuration: 0,
    totalDuration: 0,
  };

  for (const result of scanResults.results) {
    metrics.totalDuration += result.metadata.duration_ms;

    if (result.scanner === "semgrep")
      metrics.semgrepDuration = result.metadata.duration_ms;
    if (result.scanner === "osv")
      metrics.osvDuration = result.metadata.duration_ms;
    if (result.scanner === "gitleaks")
      metrics.gitleaksDuration = result.metadata.duration_ms;
    if (result.scanner === "checkov")
      metrics.checkovDuration = result.metadata.duration_ms;
    if (result.scanner === "trivy")
      metrics.trivyDuration = result.metadata.duration_ms;
  }

  return metrics;
}
