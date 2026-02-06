// src/utils/event-loop-monitor.ts
// Monitor event loop lag to detect blocking operations

interface EventLoopMetrics {
  lag_ms: number;
  threshold_exceeded: boolean;
  timestamp: string;
}

class EventLoopMonitor {
  private lastCheck = Date.now();
  private metrics: EventLoopMetrics[] = [];
  private threshold = 100; // ms - warn if event loop blocked for >100ms
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Start monitoring event loop lag
   * Reports significant delays (likely blocking operations)
   */
  startMonitoring(fastify: any, interval: number = 5000): void {
    if (this.monitoringInterval) return;

    const checkInterval = 100; // Check every 100ms

    this.monitoringInterval = setInterval(() => {
      const now = Date.now();
      const lag = now - this.lastCheck - checkInterval;

      if (lag > 0) {
        const metric: EventLoopMetrics = {
          lag_ms: lag,
          threshold_exceeded: lag > this.threshold,
          timestamp: new Date().toISOString(),
        };

        this.metrics.push(metric);

        // Keep only last 1000 metrics
        if (this.metrics.length > 1000) {
          this.metrics.shift();
        }

        // Log if threshold exceeded
        if (lag > this.threshold) {
          fastify.log.warn(
            {
              lag_ms: lag,
              threshold_ms: this.threshold,
            },
            "⚠️ EVENT LOOP BLOCKED - Possible synchronous operation detected"
          );
        }
      }

      this.lastCheck = now;
    }, checkInterval);

    fastify.log.info("Event loop monitoring started");
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Get average event loop lag
   */
  getAverageLag(): number {
    if (this.metrics.length === 0) return 0;
    const sum = this.metrics.reduce((acc, m) => acc + m.lag_ms, 0);
    return sum / this.metrics.length;
  }

  /**
   * Get max event loop lag
   */
  getMaxLag(): number {
    if (this.metrics.length === 0) return 0;
    return Math.max(...this.metrics.map((m) => m.lag_ms));
  }

  /**
   * Get percentage of checks that exceeded threshold
   */
  getThresholdExceededPercentage(): number {
    if (this.metrics.length === 0) return 0;
    const exceeded = this.metrics.filter((m) => m.threshold_exceeded).length;
    return (exceeded / this.metrics.length) * 100;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    return {
      current_lag_ms: this.lastCheck > 0 ? Date.now() - this.lastCheck : 0,
      average_lag_ms: this.getAverageLag().toFixed(2),
      max_lag_ms: this.getMaxLag(),
      threshold_exceeded_percentage:
        this.getThresholdExceededPercentage().toFixed(2),
      total_checks: this.metrics.length,
      threshold_ms: this.threshold,
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = [];
    this.lastCheck = Date.now();
  }
}

export const eventLoopMonitor = new EventLoopMonitor();
