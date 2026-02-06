// Vulnerability deduplication key generator
import { generateScanDedupKey } from './content-fingerprint';

export function generateDedupKey(vuln: any, scanId: string): string {
  return generateScanDedupKey(vuln, scanId);
}
