export interface MetricsTags {
  workspaceId?: string;
  provider?: string;
  model?: string;
  taskType?: string;
}

export class MetricsRecorder {
  increment(_name: string, _value = 1, _tags?: MetricsTags): void {
    // Intentionally no-op for Wave 3. Hook exists for future metrics backend integration.
  }

  histogram(_name: string, _value: number, _tags?: MetricsTags): void {
    // Intentionally no-op for Wave 3. Hook exists for future metrics backend integration.
  }
}
