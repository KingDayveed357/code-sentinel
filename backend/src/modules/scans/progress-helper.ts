// src/modules/scans/progress-helper.ts - Enhanced Progress Tracking

import type { FastifyInstance } from "fastify";
import type { Job } from "bullmq";

export interface ScanProgress {
  percentage: number;
  stage: string;
  details?: {
    currentScanner?: string;
    scannersCompleted?: number;
    scannersTotal?: number;
    vulnerabilitiesFound?: number;
    aiEnrichmentProgress?: number;
  };
}

export const PROGRESS_STAGES = {
  // Phase 1: Setup (0-20%)
  QUEUED: { pct: 0, msg: 'Queued' },
  STARTED: { pct: 5, msg: 'Starting scan' },
  FETCHING_METADATA: { pct: 8, msg: 'Fetching repository metadata' },
  CHECKING_CACHE: { pct: 10, msg: 'Checking scan cache' },
  CACHE_HIT: { pct: 100, msg: 'Using cached results' },
  FETCHING_CODE: { pct: 15, msg: 'Downloading code' },
  WORKSPACE_READY: { pct: 20, msg: 'Workspace ready' },
  
  // Phase 2: Scanning (20-60%)
  SCANNERS_STARTING: { pct: 25, msg: 'Starting security scanners' },
  // Scanner-specific stages calculated dynamically
  
  // Phase 3: Post-processing (60-90%)
  SCANNERS_COMPLETE: { pct: 60, msg: 'All scanners completed' },
  DEDUPLICATING: { pct: 65, msg: 'Removing duplicates' },
  AI_ENRICHING: { pct: 70, msg: 'Enriching findings with AI' },
  AI_COMPLETE: { pct: 85, msg: 'AI enrichment complete' },
  
  // Phase 4: Finalization (90-100%)
  STORING: { pct: 90, msg: 'Storing results' },
  CALCULATING_SCORE: { pct: 95, msg: 'Calculating security score' },
  COMPLETE: { pct: 100, msg: 'Scan complete' },
  FAILED: { pct: 100, msg: 'Scan failed' }
};

export class ProgressTracker {
  private scannersTotal: number = 0;
  private scannersCompleted: number = 0;
  private vulnerabilitiesFound: number = 0;
  
  constructor(
    private fastify: FastifyInstance,
    private scanId: string,
    private job?: Job
  ) {}
  
  async setStage(stage: keyof typeof PROGRESS_STAGES, details?: any) {
    const { pct, msg } = PROGRESS_STAGES[stage];
    await this.update(pct, msg, details);
  }
  
  async setScannerProgress(scannerName: string, completed: boolean) {
    if (completed) {
      this.scannersCompleted++;
    }
    
    // Calculate dynamic progress within scanner phase (25-60%)
    const scannerPhaseStart = 25;
    const scannerPhaseEnd = 60;
    const progress = this.scannersTotal > 0
      ? scannerPhaseStart + (this.scannersCompleted / this.scannersTotal) * (scannerPhaseEnd - scannerPhaseStart)
      : scannerPhaseStart;
    
    await this.update(
      Math.round(progress),
      completed ? `Completed ${scannerName}` : `Running ${scannerName}`,
      { 
        currentScanner: scannerName,
        scannersCompleted: this.scannersCompleted,
        scannersTotal: this.scannersTotal,
        vulnerabilitiesFound: this.vulnerabilitiesFound
      }
    );
  }
  
  setScannersTotal(count: number) {
    this.scannersTotal = count;
  }
  
  addVulnerabilities(count: number) {
    this.vulnerabilitiesFound += count;
  }
  
  async update(percentage: number, stage: string, details?: any) {
    // Update database
    await this.fastify.supabase
      .from('scans')
      .update({
        progress_percentage: percentage,
        progress_stage: stage,
      })
      .eq('id', this.scanId);
    
    // Update BullMQ job
    if (this.job) {
      await this.job.updateProgress({
        percentage,
        stage,
        details: {
          ...details,
          vulnerabilitiesFound: this.vulnerabilitiesFound
        }
      });
    }
  }
}

// Legacy compatibility function
export async function updateProgress(
  fastify: FastifyInstance,
  scanId: string,
  stage: keyof typeof PROGRESS_STAGES,
  job?: Job
) {
  const tracker = new ProgressTracker(fastify, scanId, job);
  await tracker.setStage(stage);
}
