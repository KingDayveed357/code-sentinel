// src/scanners/container/types.ts
export interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity: string;
  Title?: string;
  Description?: string;
  References?: string[];
  PrimaryURL?: string;
  CweIDs?: string[];
  CVSS?: {
    nvd?: {
      V3Score?: number;
      V3Vector?: string;
    };
  };
  Layer?: {
    Digest: string;
  };
}