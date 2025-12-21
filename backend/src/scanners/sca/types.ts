// src/scanners/sca/types.ts
// ===================================================================
export interface OSVPackage {
  name: string;
  version: string;
  ecosystem: string;
}

export interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  severity?: string;
  aliases?: string[];
  references?: Array<{ url: string; type: string }>;
  affected?: Array<{
    package: OSVPackage;
    ranges: Array<{
      type: string;
      events: Array<{ introduced?: string; fixed?: string }>;
    }>;
  }>;
  database_specific?: {
    cwe_ids?: string[];
    severity?: string;
  };
}
