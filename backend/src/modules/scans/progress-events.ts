// src/modules/scans/progress-events.ts
// Real progress tracking based on actual scanner lifecycle events

import type { FastifyInstance } from 'fastify';

export interface ProgressEvent {
  scanId: string;
  stage: 'init' | 'fetch' | 'scanning' | 'scanner_start' | 'scanner_complete' | 'normalizing' | 'enriching' | 'storing' | 'complete';
  progress_percent: number;
  current_scanner?: string;
  message: string;
  timestamp: string;
}

export class ProgressTracker {
  private events: ProgressEvent[] = [];
  
  private stageProgressMap = {
    'init': 5,
    'fetch': 15,
    'scanning': 20,
    'scanner_start': 25,
    'scanner_complete': 75,  // Dynamic - updated per scanner
    'normalizing': 80,
    'enriching': 90,
    'storing': 95,
    'complete': 100,
  };

  constructor(private fastify: FastifyInstance, private scanId: string) {}

  /**
   * Emit a progress event
   * ✅ FIX: Also update scans.progress_percentage for frontend consumption
   */
  async emit(
    stage: ProgressEvent['stage'],
    message: string,
    currentScanner?: string
  ): Promise<void> {
    const progress_percent = this.stageProgressMap[stage];
    
    const event: ProgressEvent = {
      scanId: this.scanId,
      stage,
      progress_percent,
      current_scanner: currentScanner,
      message,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
    
    this.fastify.log.debug(
      { scanId: this.scanId, stage, progress: progress_percent, scanner: currentScanner },
      `Progress: ${message}`
    );

    // Store progress event in database for real-time UI updates
    try {
      await Promise.all([
        // Store event for detailed progress tracking
        this.fastify.supabase.from('scan_progress_events').insert({
          scan_id: this.scanId,
          stage,
          progress_percent,
          current_scanner: currentScanner || null,
          message,
        }),
        // Update scans table for quick progress queries
        this.fastify.supabase
          .from('scans')
          .update({
            progress_percentage: progress_percent,
            progress_stage: message,
          })
          .eq('id', this.scanId),
      ]);
    } catch (err: any) {
      this.fastify.log.warn({ err }, 'Failed to store progress event');
    }
  }

  /**
   * Update scanner progress dynamically
   * Distributes the "scanning" phase (20-75%) among active scanners
   * ✅ FIX: Also update scans.progress_percentage
   */
  async updateScannerProgress(
    scannersRunning: string[],
    completedCount: number,
    currentScanner: string,
    totalDuration: number
  ): Promise<void> {
    if (scannersRunning.length === 0) return;

    // Distribute scanning phase (20% to 75% = 55 percentage points)
    const scanningPhaseStart = 20;
    const scanningPhaseEnd = 75;
    const scanningPhaseRange = scanningPhaseEnd - scanningPhaseStart;
    
    const percentPerScanner = scanningPhaseRange / scannersRunning.length;
    const progress_percent = Math.round(
      scanningPhaseStart + (completedCount * percentPerScanner)
    );

    const message = `Running ${currentScanner} (${completedCount}/${scannersRunning.length} completed) - ${totalDuration}ms elapsed`;

    const event: ProgressEvent = {
      scanId: this.scanId,
      stage: 'scanner_start',
      progress_percent,
      current_scanner: currentScanner,
      message,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);

    try {
      await Promise.all([
        // Store event for detailed progress tracking
        this.fastify.supabase.from('scan_progress_events').insert({
          scan_id: this.scanId,
          stage: 'scanner_start',
          progress_percent,
          current_scanner: currentScanner,
          message,
        }),
        // Update scans table for quick progress queries
        this.fastify.supabase
          .from('scans')
          .update({
            progress_percentage: progress_percent,
            progress_stage: message,
          })
          .eq('id', this.scanId),
      ]);
    } catch (err) {
      // Non-fatal
      this.fastify.log.warn({ err }, 'Failed to update scanner progress');
    }
  }

  /**
   * Get all progress events
   */
  getEvents(): ProgressEvent[] {
    return this.events;
  }
}
