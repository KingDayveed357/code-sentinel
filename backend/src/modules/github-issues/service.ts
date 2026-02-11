// src/modules/github-issues/service.ts
// =====================================================
// GitHub Issues Service - Create Issues from Vulnerabilities
// =====================================================
import type { FastifyInstance } from 'fastify';
import { getIntegration } from '../integrations/service';
import type { GitHubIssueCreatePayload, GitHubIssueResponse, IssueCreationResult } from '../webhooks/types';

/**
 * Create GitHub issue for a vulnerability
 */
export async function createGitHubIssue(
  fastify: FastifyInstance,
  workspaceId: string,
  userId: string | null,
  vulnerability: {
    id: string;
    type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
    severity: string;
    title: string;
    description: string;
    file_path?: string;
    line_start?: number;
    recommendation?: string;
    cwe?: string | string[];
    cve?: string;
  },
  scanContext: {
    scanId: string;
    repositoryId: string;
    repoFullName: string;
    branch: string;
    commitSha?: string;
  },
  options?: {
    labels?: string[];
    assignees?: string[];
    auto?: boolean;
  }
): Promise<IssueCreationResult> {
  try {
    // Get GitHub integration using workspace context
    const integration = await getIntegration(fastify, workspaceId, 'github');

    if (!integration || !integration.access_token) {
      return {
        success: false,
        error: 'GitHub integration not found or token missing',
      };
    }

    // Check if issue already exists
    const { data: existingIssue } = await fastify.supabase
      .from('github_issues')
      .select('github_issue_url, github_issue_number')
      .eq('vulnerability_id', vulnerability.id)
      .eq('repository_id', scanContext.repositoryId)
      .eq('issue_status', 'open')
      .single();

    if (existingIssue) {
      fastify.log.info(
        {
          vulnerabilityId: vulnerability.id,
          issueUrl: existingIssue.github_issue_url,
        },
        'Issue already exists for vulnerability'
      );

      return {
        success: true,
        issue_url: existingIssue.github_issue_url,
        issue_number: existingIssue.github_issue_number,
      };
    }

    // Build issue payload
    const issuePayload = buildIssuePayload(vulnerability, scanContext, options);

    // Create issue on GitHub
    const [owner, repo] = scanContext.repoFullName.split('/');

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${integration.access_token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(issuePayload),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const githubIssue: GitHubIssueResponse = await response.json();

    // Store issue in database
    const { data: issueRecord, error: dbError } = await fastify.supabase
      .from('github_issues')
      .insert({
        vulnerability_id: vulnerability.id,
        vulnerability_type: vulnerability.type,
        workspace_id: workspaceId,
        repository_id: scanContext.repositoryId,
        scan_id: scanContext.scanId,
        user_id: userId, // Can be null for auto-created
        github_issue_id: githubIssue.id,
        github_issue_number: githubIssue.number,
        github_issue_url: githubIssue.html_url,
        title: issuePayload.title,
        body: issuePayload.body,
        labels: issuePayload.labels || [],
        assignees: issuePayload.assignees || [],
        issue_status: 'open',
        creation_type: options?.auto ? 'automatic' : 'manual',
        created_by: options?.auto ? null : userId,
      })
      .select()
      .single();

    if (dbError) {
      fastify.log.error({ dbError }, 'Failed to store GitHub issue in database');
    }

    fastify.log.info(
      {
        vulnerabilityId: vulnerability.id,
        issueNumber: githubIssue.number,
        issueUrl: githubIssue.html_url,
      },
      'GitHub issue created successfully'
    );

    return {
      success: true,
      issue_url: githubIssue.html_url,
      issue_number: githubIssue.number,
    };
  } catch (error: any) {
    fastify.log.error(
      {
        error,
        vulnerabilityId: vulnerability.id,
      },
      'Failed to create GitHub issue'
    );

    return {
      success: false,
      error: error.message || 'Failed to create GitHub issue',
    };
  }
}

/**
 * Build GitHub issue payload from vulnerability
 */
function buildIssuePayload(
  vulnerability: any,
  scanContext: any,
  options?: any
): GitHubIssueCreatePayload {
  const severityEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
    info: '⚪',
  };

  const typeLabels = {
    sast: 'SAST',
    sca: 'SCA',
    secrets: 'Secrets',
    iac: 'IaC',
    container: 'Container',
  };

  // Build title
  const emoji = severityEmoji[vulnerability.severity as keyof typeof severityEmoji] || '🔵';
  const title = `[Security] ${emoji} ${vulnerability.severity.toUpperCase()}: ${vulnerability.title}`;

  // Build body
  const fileLocation = vulnerability.file_path
    ? vulnerability.line_start
      ? `\`${vulnerability.file_path}:${vulnerability.line_start}\``
      : `\`${vulnerability.file_path}\``
    : 'N/A';

  const commitLink = scanContext.commitSha
    ? `[\`${scanContext.commitSha.slice(0, 7)}\`](https://github.com/${scanContext.repoFullName}/commit/${scanContext.commitSha})`
    : 'N/A';

  let body = `## 🛡️ Security Vulnerability Detected

**Severity:** ${emoji} **${vulnerability.severity.toUpperCase()}**  
**Type:** ${typeLabels[vulnerability.type as keyof typeof typeLabels] || vulnerability.type}  
**Scan ID:** \`${scanContext.scanId}\`

---

### 📍 Location
- **File:** ${fileLocation}
- **Branch:** \`${scanContext.branch}\`
- **Commit:** ${commitLink}

---

### 📝 Description
${vulnerability.description || 'No description available.'}

---
`;

  // Add CWE/CVE if available
  if (vulnerability.cwe || vulnerability.cve) {
    body += `### 🔍 References\n`;

    if (vulnerability.cwe) {
      const cwes = Array.isArray(vulnerability.cwe) ? vulnerability.cwe : [vulnerability.cwe];
      cwes.forEach((cwe: string) => {
        body += `- [${cwe}](https://cwe.mitre.org/data/definitions/${cwe.replace('CWE-', '')}.html)\n`;
      });
    }

    if (vulnerability.cve) {
      body += `- [${vulnerability.cve}](https://cve.mitre.org/cgi-bin/cvename.cgi?name=${vulnerability.cve})\n`;
    }

    body += '\n---\n\n';
  }

  // Add recommendation
  if (vulnerability.recommendation) {
    body += `### 💡 Recommended Fix
${vulnerability.recommendation}

---
`;
  }

  body += `
### 🤖 Automated Detection
This issue was automatically created by [CodeSentinel](https://codesentinel.com) security scanner.

---

**Need help?** [View full scan report](https://app.codesentinel.com/dashboard/projects/${scanContext.repositoryId}/scans/${scanContext.scanId}/report)
`;

  // Build labels
  const labels = [
    'security',
    vulnerability.type,
    `severity:${vulnerability.severity}`,
    ...(options?.labels || []),
  ];

  return {
    title,
    body,
    labels,
    assignees: options?.assignees || [],
  };
}

/**
 * Automatically create issues for high/critical vulnerabilities
 */
export async function autoCreateIssuesForScan(
  fastify: FastifyInstance,
  scanId: string
): Promise<{ created: number; skipped: number; failed: number }> {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Get scan details
    const { data: scan, error: scanError } = await fastify.supabase
      .from('scans')
      .select('id, workspace_id, user_id, repository_id, branch, commit_hash')
      .eq('id', scanId)
      .single();

    if (scanError || !scan) {
      throw new Error('Scan not found');
    }

    // Get repository details
    const { data: repository } = await fastify.supabase
      .from('repositories')
      .select('id, full_name')
      .eq('id', scan.repository_id)
      .single();

    if (!repository) {
      throw new Error('Repository not found');
    }

    // Get repository settings
    const { data: settings } = await fastify.supabase
      .from('repository_settings')
      .select('*')
      .eq('repository_id', scan.repository_id)
      .single();

    if (!settings || !settings.auto_create_issues) {
      fastify.log.info({ scanId }, 'Auto-create issues disabled for repository');
      return { created: 0, skipped: 0, failed: 0 };
    }

    // Determine severity threshold
    const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
    const minSeverityIndex = severityOrder.indexOf(
      settings.issue_severity_threshold || 'high'
    );

    // Fetch all instances for this scan
    const { data: instances, error: instanceError } = await fastify.supabase
      .from('vulnerability_instances')
      .select(`
        vulnerability_id,
        file_path,
        line_start,
        vulnerabilities_unified!inner (
          id,
          severity,
          title,
          description,
          scanner_type,
          ai_remediation,
          cwe,
          scanner_metadata
        )
      `)
      .eq('scan_id', scanId);

    if (instanceError) {
      throw new Error(`Failed to fetch scan instances: ${instanceError.message}`);
    }

    if (!instances || instances.length === 0) {
      fastify.log.info({ scanId }, 'No vulnerabilities found for auto-issue creation');
      return { created: 0, skipped: 0, failed: 0 };
    }

    // Map to flat structure and filter by severity
    const eligibleVulns = instances
      .map((inst: any) => {
        const unified = inst.vulnerabilities_unified;
        return {
            id: unified.id,
            type: unified.scanner_type,
            severity: unified.severity,
            title: unified.title,
            description: unified.description,
            file_path: inst.file_path,
            line_start: inst.line_start,
            recommendation: unified.ai_remediation,
            cwe: unified.cwe,
            cve: unified.scanner_metadata?.cve
        };
      })
      .filter((v: any) => {
        const severityIndex = severityOrder.indexOf(v.severity);
        return severityIndex >= minSeverityIndex;
      });

    fastify.log.info(
      {
        scanId,
        eligible: eligibleVulns.length,
        threshold: settings.issue_severity_threshold,
      },
      'Processing vulnerabilities for auto-issue creation'
    );

    // Create issues
    for (const vuln of eligibleVulns) {
      // Check if issue already exists logic is handled inside createGitHubIssue too
      
      // Create issue
      const result = await createGitHubIssue(
        fastify,
        scan.workspace_id, // Pass workspaceId explicitly
        null, // Auto-created, no user context
        vuln,
        {
          scanId: scan.id,
          repositoryId: scan.repository_id,
          repoFullName: repository.full_name,
          branch: scan.branch,
          commitSha: scan.commit_hash,
        },
        {
          labels: settings.issue_labels,
          assignees: settings.issue_assignees,
          auto: true,
        }
      );

      if (result.success) {
        if (result.issue_number) created++;
        else skipped++; // Existed
      } else {
        failed++;
      }

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    fastify.log.info(
      { scanId, created, skipped, failed },
      'Auto-issue creation completed'
    );
  } catch (error: any) {
    fastify.log.error({ error, scanId }, 'Auto-issue creation failed');
  }

  return { created, skipped, failed };
}

/**
 * Close GitHub issue
 */
export async function closeGitHubIssue(
  fastify: FastifyInstance,
  userId: string,
  issueId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get issue record
    const { data: issue } = await fastify.supabase
      .from('github_issues')
      .select('*, repositories!inner(full_name)')
      .eq('id', issueId)
      .eq('user_id', userId)
      .single();

    if (!issue) {
      return { success: false, error: 'Issue not found' };
    }

    // Get GitHub integration - user might need to be author, so we check user integration
    // But if team workspace, we should use workspace integration
    // But close issue is usually manual action by user.
    // If workspaceId is not in arguments, we might need to derive it from issue or repository?
    // The previous implementation used getIntegration(fastify, userId).
    // If changed to getIntegration(fastify, workspaceId), we need proper workspace context.
    // Assuming userId here is sufficient for legacy closing or we need to update it too.
    // For now, let's keep it as is unless it breaks.
    // But getIntegration now expects workspaceId.
    // So 'userId' passed here better be a workspaceId if user is team admin? No.
    // This function 'closeGitHubIssue' is problematic if getIntegration signature changed.
    
    // Quick fix: pass ISSUE's workspace_id if available, or fetch it.
    // Assuming github_issues table has workspace_id (since we added it in createGitHubIssue).
    
    // Fetch workspace_id from issue record?
    // We already fetch issue record.
    // Let's assume issue.workspace_id exists.
    
    // const workspaceId = issue.workspace_id;
    // const integration = await getIntegration(fastify, workspaceId, 'github');
    
    // But TS might complain if I don't know the schema.
    // Let's stick to original logic but fix the `getIntegration` call.
    // If I can't fix `closeGitHubIssue` safely, I leave it broken? No.
    // The `getIntegration` expects workspaceId.
    // I should fetch workspace_id via issue.
    // I'll add workspace_id to select.
    
    const { data: issueWithWorkspace } = await fastify.supabase
      .from('github_issues')
      .select('*, repositories!inner(full_name)')
      .eq('id', issueId)
      // .eq('user_id', userId) // removed user ownership check for shared workspace issues?
      // Or keep ownership check.
      .single();
      
     if (!issueWithWorkspace) return { success: false, error: 'Issue not found' };
     
     // Assuming workspace_id is on issue. If not, use repository.workspace_id via join?
     // repositories!inner(full_name, workspace_id)
     
     const { data: repo } = await fastify.supabase.from('repositories').select('workspace_id').eq('id', issueWithWorkspace.repository_id).single();
     if (!repo) return { success: false, error: 'Repository not found' };
     
     const integration = await getIntegration(fastify, repo.workspace_id, 'github');
     
     if (!integration || !integration.access_token) {
        return { success: false, error: 'GitHub integration not found' };
     }

    // Close issue on GitHub
    const [owner, repoName] = issueWithWorkspace.repositories.full_name.split('/');

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/${issueWithWorkspace.github_issue_number}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `token ${integration.access_token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed' }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    // Update database
    await fastify.supabase
      .from('github_issues')
      .update({
        issue_status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', issueId);

    return { success: true };
  } catch (error: any) {
    fastify.log.error({ error, issueId }, 'Failed to close GitHub issue');
    return { success: false, error: error.message };
  }
}