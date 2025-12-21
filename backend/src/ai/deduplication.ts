// // src/ai/deduplication.ts - Smart Rule-Based Deduplication (NO AI)
// // ===================================================================
// import type { FastifyInstance } from 'fastify';
// import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';

// export class DeduplicationService {
//   constructor(private fastify: FastifyInstance) {}

//   /**
//    * Deduplicate vulnerabilities using smart heuristics (NO AI)
//    * - Groups by file + rule + similar lines
//    * - Prioritizes by scanner trust & confidence
//    * - Detects cross-scanner duplicates
//    */
//   deduplicate(vulnerabilities: NormalizedVulnerability[]): {
//     unique: NormalizedVulnerability[];
//     removed: number;
//     groups: Map<string, NormalizedVulnerability[]>;
//   } {
//     const startTime = Date.now();
    
//     // Step 1: Group similar vulnerabilities
//     const groups = this.groupSimilarVulnerabilities(vulnerabilities);
    
//     // Step 2: Select best representative from each group
//     const unique: NormalizedVulnerability[] = [];
    
//     for (const [key, group] of groups.entries()) {
//       if (group.length === 1) {
//         unique.push(group[0]);
//       } else {
//         // Multiple vulnerabilities in group - pick the best one
//         const best = this.selectBestVulnerability(group);
        
//         // Merge metadata from duplicates
//         best.metadata = {
//           ...best.metadata,
//           duplicate_count: group.length,
//           duplicate_scanners: [...new Set(group.map(v => v.scanner))],
//           duplicate_rule_ids: [...new Set(group.map(v => v.rule_id))],
//         };
        
//         unique.push(best);
        
//         this.fastify.log.debug(
//           { groupKey: key, count: group.length, kept: best.rule_id },
//           'Merged duplicate vulnerabilities'
//         );
//       }
//     }
    
//     const removed = vulnerabilities.length - unique.length;
    
//     this.fastify.log.info(
//       {
//         original: vulnerabilities.length,
//         unique: unique.length,
//         removed,
//         duration_ms: Date.now() - startTime,
//       },
//       'Deduplication completed'
//     );
    
//     return { unique, removed, groups };
//   }

//   /**
//    * Group similar vulnerabilities by file, location, and issue type
//    */
//   private groupSimilarVulnerabilities(
//     vulnerabilities: NormalizedVulnerability[]
//   ): Map<string, NormalizedVulnerability[]> {
//     const groups = new Map<string, NormalizedVulnerability[]>();

//     for (const vuln of vulnerabilities) {
//       const keys = this.generateGroupingKeys(vuln);
      
//       // Try to find existing group
//       let added = false;
//       for (const key of keys) {
//         if (groups.has(key)) {
//           groups.get(key)!.push(vuln);
//           added = true;
//           break;
//         }
//       }
      
//       // Create new group if no match
//       if (!added) {
//         const primaryKey = keys[0];
//         groups.set(primaryKey, [vuln]);
//       }
//     }

//     return groups;
//   }


//   /**
//    * Generate multiple grouping keys for fuzzy matching
//    */
//   private generateGroupingKeys(vuln: NormalizedVulnerability): string[] {
//     const keys: string[] = [];
    
//     // Normalize file path (remove leading slashes, lowercase)
//     const normalizedPath = (vuln.file_path || 'unknown')
//       .replace(/^\/+/, '')
//       .toLowerCase();
    
//     // Normalize rule ID (some scanners have prefixes)
//     const normalizedRule = this.normalizeRuleId(vuln.rule_id);
    
//     // Line grouping (group ±5 lines together)
//     const lineGroup = vuln.line_start 
//       ? Math.floor(vuln.line_start / 5) * 5 
//       : 0;
    
//     // Key 1: Exact match (file + rule + line)
//     keys.push(`${normalizedPath}:${normalizedRule}:${lineGroup}`);
    
//     // Key 2: Same file + same CWE (catches similar issues)
//     if (vuln.cwe.length > 0) {
//       const primaryCwe = vuln.cwe[0];
//       keys.push(`${normalizedPath}:cwe:${primaryCwe}:${lineGroup}`);
//     }
    
//     // Key 3: Same CVE (for dependency vulnerabilities)
//     if (vuln.cve) {
//       keys.push(`cve:${vuln.cve}`);
//     }
    
//     // Key 4: Package vulnerabilities (SCA)
//     if (vuln.type === 'sca' && vuln.metadata?.package_name) {
//       const pkg = vuln.metadata.package_name;
//       const ver = vuln.metadata.package_version;
//       keys.push(`pkg:${pkg}:${ver}:${normalizedRule}`);
//     }
    
//     // Key 5: Secret types (Gitleaks)
//     if (vuln.type === 'secret' && vuln.metadata?.secret_type) {
//       keys.push(`secret:${normalizedPath}:${vuln.metadata.secret_type}:${lineGroup}`);
//     }
    
//     return keys;
//   }

//   /**
//    * Normalize rule IDs to catch scanner variations
//    */
//   private normalizeRuleId(ruleId: string): string {
//     // Remove common prefixes
//     return ruleId
//       .replace(/^(semgrep\.|rules\.)/, '')
//       .toLowerCase()
//       .trim();
//   }

//   /**
//    * Select the best vulnerability from a group of duplicates
//    * Priority: Scanner trust > Confidence > Severity > Details
//    */
//   private selectBestVulnerability(
//     group: NormalizedVulnerability[]
//   ): NormalizedVulnerability {
//     // Scanner trust levels (higher = more reliable)
//     const scannerPriority: Record<string, number> = {
//       semgrep: 5,    // Most reliable for SAST
//       osv: 5,        // CVE database (authoritative)
//       gitleaks: 4,   // Good for secrets
//       checkov: 3,    // Good for IaC
//       trivy: 4,      // Good for containers
//     };

//     return group.sort((a, b) => {
//       // 1. Scanner trust
//       const priorityDiff = 
//         (scannerPriority[b.scanner] || 0) - 
//         (scannerPriority[a.scanner] || 0);
//       if (priorityDiff !== 0) return priorityDiff;

//       // 2. Confidence score
//       const confidenceDiff = b.confidence - a.confidence;
//       if (confidenceDiff !== 0) return confidenceDiff;

//       // 3. Severity
//       const severityOrder = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
//       const severityDiff = 
//         (severityOrder[b.severity] || 0) - 
//         (severityOrder[a.severity] || 0);
//       if (severityDiff !== 0) return severityDiff;

//       // 4. Has CVE/CWE (more detailed)
//       const aHasDetails = (a.cve ? 1 : 0) + a.cwe.length;
//       const bHasDetails = (b.cve ? 1 : 0) + b.cwe.length;
//       const detailsDiff = bHasDetails - aHasDetails;
//       if (detailsDiff !== 0) return detailsDiff;

//       // 5. Description length (more detailed is better)
//       return b.description.length - a.description.length;
//     })[0];
//   }

//   /**
//    * Get deduplication statistics
//    */
//   getStats(
//     original: NormalizedVulnerability[],
//     unique: NormalizedVulnerability[]
//   ) {
//     const byType = (vulns: NormalizedVulnerability[]) => {
//       return vulns.reduce((acc, v) => {
//         acc[v.type] = (acc[v.type] || 0) + 1;
//         return acc;
//       }, {} as Record<string, number>);
//     };

//     const crossScanner = unique.filter(
//       v => v.metadata?.duplicate_count && v.metadata.duplicate_count > 1
//     ).length;

//     return {
//       original_count: original.length,
//       unique_count: unique.length,
//       removed_count: original.length - unique.length,
//       deduplication_rate: Math.round(
//         ((original.length - unique.length) / original.length) * 100
//       ),
//       cross_scanner_duplicates: crossScanner,
//       by_type_before: byType(original),
//       by_type_after: byType(unique),
//     };
//   }
// }

// src/ai/deduplication.ts - Enhanced Deduplication with Summary Mode
import type { FastifyInstance } from 'fastify';
import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';

export type DeduplicationMode = 'exact' | 'summary';

export interface DeduplicationResult {
  unique: NormalizedVulnerability[];
  removed: number;
  groups: Map<string, NormalizedVulnerability[]>;
  mode: DeduplicationMode;
}

export class DeduplicationService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Deduplicate vulnerabilities
   * - 'exact': Only removes exact duplicates (same file, rule, line)
   * - 'summary': Groups by rule_id only (for AI enrichment efficiency)
   */
  deduplicate(
    vulnerabilities: NormalizedVulnerability[],
    mode: DeduplicationMode = 'exact'
  ): DeduplicationResult {
    const startTime = Date.now();
    
    this.fastify.log.info(
      { total: vulnerabilities.length, mode },
      'Starting deduplication'
    );

    const groups = mode === 'exact'
      ? this.groupExactDuplicates(vulnerabilities)
      : this.groupByRuleId(vulnerabilities);
    
    const unique: NormalizedVulnerability[] = [];
    
    for (const [key, group] of groups.entries()) {
      if (group.length === 1) {
        unique.push(group[0]);
      } else {
        const best = this.selectBestVulnerability(group);
        
        // For summary mode, aggregate metadata
        if (mode === 'summary') {
          best.metadata = {
            ...best.metadata,
            grouped_count: group.length,
            affected_files: [...new Set(group.map(v => v.file_path).filter(Boolean))],
            severity_distribution: this.calculateSeverityDistribution(group),
          };
        } else {
          // For exact mode, just mark duplicates
          best.metadata = {
            ...best.metadata,
            duplicate_count: group.length,
            duplicate_scanners: [...new Set(group.map(v => v.scanner))],
          };
        }
        
        unique.push(best);
        
        this.fastify.log.debug(
          { groupKey: key, count: group.length, mode },
          'Merged vulnerabilities'
        );
      }
    }
    
    const removed = vulnerabilities.length - unique.length;
    
    this.fastify.log.info(
      {
        original: vulnerabilities.length,
        unique: unique.length,
        removed,
        reduction_pct: Math.round((removed / vulnerabilities.length) * 100),
        duration_ms: Date.now() - startTime,
      },
      'Deduplication completed'
    );
    
    return { unique, removed, groups, mode };
  }

  /**
   * Group exact duplicates only (same file, rule, and nearby lines)
   */
  private groupExactDuplicates(
    vulnerabilities: NormalizedVulnerability[]
  ): Map<string, NormalizedVulnerability[]> {
    const groups = new Map<string, NormalizedVulnerability[]>();

    for (const vuln of vulnerabilities) {
      // Normalize path
      const normalizedPath = (vuln.file_path || 'unknown')
        .replace(/^\/+/, '')
        .toLowerCase();
      
      // Normalize rule
      const normalizedRule = this.normalizeRuleId(vuln.rule_id);
      
      // Line grouping (±2 lines tolerance for exact matching)
      const lineGroup = vuln.line_start 
        ? Math.floor(vuln.line_start / 2) * 2 
        : 0;
      
      // Exact key: file + rule + line group
      const key = `${normalizedPath}:${normalizedRule}:${lineGroup}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(vuln);
    }

    return groups;
  }

  /**
   * Group by rule_id only (for AI efficiency - one enrichment per rule type)
   */
  private groupByRuleId(
    vulnerabilities: NormalizedVulnerability[]
  ): Map<string, NormalizedVulnerability[]> {
    const groups = new Map<string, NormalizedVulnerability[]>();

    for (const vuln of vulnerabilities) {
      const normalizedRule = this.normalizeRuleId(vuln.rule_id);
      
      // Group by rule + severity (to keep critical separate from low)
      const key = `${normalizedRule}:${vuln.severity}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(vuln);
    }

    return groups;
  }

  /**
   * Normalize rule IDs to catch scanner variations
   */
  private normalizeRuleId(ruleId: string): string {
    return ruleId
      .replace(/^(semgrep\.|rules\.|CKV_)/, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Select the best vulnerability from a group
   */
  private selectBestVulnerability(
    group: NormalizedVulnerability[]
  ): NormalizedVulnerability {
    const scannerPriority: Record<string, number> = {
      semgrep: 5,
      osv: 5,
      gitleaks: 4,
      trivy: 4,
      checkov: 3,
    };

    return group.sort((a, b) => {
      // 1. Scanner trust
      const priorityDiff = 
        (scannerPriority[b.scanner] || 0) - 
        (scannerPriority[a.scanner] || 0);
      if (priorityDiff !== 0) return priorityDiff;

      // 2. Confidence score
      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;

      // 3. Severity
      const severityOrder = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
      const severityDiff = 
        (severityOrder[b.severity] || 0) - 
        (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;

      // 4. Has more details (code snippet, CWE, etc.)
      const aHasDetails = (a.code_snippet ? 1 : 0) + (a.cve ? 1 : 0) + a.cwe.length;
      const bHasDetails = (b.code_snippet ? 1 : 0) + (b.cve ? 1 : 0) + b.cwe.length;
      return bHasDetails - aHasDetails;
    })[0];
  }

  /**
   * Calculate severity distribution within a group
   */
  private calculateSeverityDistribution(group: NormalizedVulnerability[]) {
    return group.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get deduplication statistics
   */
  getStats(
    original: NormalizedVulnerability[],
    unique: NormalizedVulnerability[],
    mode: DeduplicationMode
  ) {
    const byType = (vulns: NormalizedVulnerability[]) => {
      return vulns.reduce((acc, v) => {
        acc[v.type] = (acc[v.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    };

    const grouped = unique.filter(
      v => v.metadata?.grouped_count && v.metadata.grouped_count > 1
    );

    return {
      mode,
      original_count: original.length,
      unique_count: unique.length,
      removed_count: original.length - unique.length,
      deduplication_rate: Math.round(
        ((original.length - unique.length) / original.length) * 100
      ),
      grouped_items: grouped.length,
      by_type_before: byType(original),
      by_type_after: byType(unique),
    };
  }
}