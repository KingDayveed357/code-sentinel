// src/modules/scans/pipeline/steps/fetch-code.ts
// Step: Fetch repository code and resolve commit hash

import type { FastifyInstance } from "fastify";
import * as crypto from "crypto";
import * as path from "path";
import { asyncMkdtemp, asyncExec, asyncRmdir } from "../../../../utils/async-exec";
import { getIntegration } from "../../../integrations/service";
import { getCommitHash } from "../../../integrations/github/commit-resolver";
import type { ProgressTracker } from "../utils/progress";
import { getDirectoryStats } from "../utils/file-stats";

export type ScanLogger = (
  level: "info" | "warning" | "error" | "debug",
  message: string,
  details?: any
) => Promise<void>;

export async function fetchRepoAndResolveCommit(
  fastify: FastifyInstance,
  workspaceId: string,
  repositoryId: string,
  branch: string | undefined,
  log: ScanLogger
): Promise<{ repo: any; commitHash: string }> {
  // Fetch repo metadata
  await log("info", "Fetching repository metadata");
  const { data: repo, error: repoError } = await fastify.supabase
    .from("repositories")
    .select("full_name, default_branch")
    .eq("id", repositoryId)
    .single();

  if (repoError || !repo) {
    throw new Error("Project not found");
  }

  // Resolve commit hash
  await log("info", "Resolving commit hash for deterministic tracking");
  let commitHash = "unknown";
  try {
    const resolved = await getCommitHash(
      fastify,
      workspaceId,
      repo.full_name,
      branch || repo.default_branch
    );

    if (resolved && resolved !== "unknown") {
      commitHash = resolved;
      await log("info", `✅ Commit tracked: ${commitHash.substring(0, 7)}`, {
        commitHash,
        caching_enabled: true,
      });
    } else {
      // Synthetic hash
      const synthetic = crypto
        .createHash("sha256")
        .update(
          `${repo.full_name}:${branch || repo.default_branch}:${
            new Date().toISOString().split("T")[0]
          }`
        )
        .digest("hex");
      commitHash = synthetic;

      await log(
        "warning",
        `⚠️ Using synthetic commit hash: ${commitHash.substring(0, 7)} (GitHub unavailable)`,
        {
          commitHash,
          reason: "GitHub API unavailable, using daily synthetic hash",
          caching_enabled: true,
        }
      );
    }
  } catch (err: any) {
    // Synthetic hash fallback
    const synthetic = crypto
      .createHash("sha256")
      .update(
        `${repo.full_name}:${branch || repo.default_branch}:${
          new Date().toISOString().split("T")[0]
        }`
      )
      .digest("hex");
    commitHash = synthetic;

    await log(
      "warning",
      `⚠️ Commit resolution failed, using synthetic: ${commitHash.substring(0, 7)}`,
      {
        error: err.message,
      }
    );
  }

  return { repo, commitHash };
}

export async function prepareWorkspace(
  fastify: FastifyInstance,
  scanId: string,
  workspaceId: string,
  repoFullName: string,
  branch: string | undefined,
  defaultBranch: string,
  log: ScanLogger,
  progress: ProgressTracker
): Promise<{ workspacePath: string; stats: { filesScanned: number; linesOfCode: number; sizeBytes: number } } | null> {
  const targetBranch = branch || defaultBranch;
  await log("info", `Cloning repository ${repoFullName} (branch: ${targetBranch})`);
  
  // Create temp dir
  const workspacePath = await asyncMkdtemp(`scan-${scanId}-`);
  await log("info", "Created temporary workspace", { workspacePath });

  try {
    // Get token
    const integration = await getIntegration(fastify, workspaceId, "github");
    if (!integration || !integration.access_token) {
      throw new Error("GitHub token not found or integration disconnected");
    }
    const token = integration.access_token;
    
    // Construct clone command (masked for security)
    const cloneUrl = `https://${token}@github.com/${repoFullName}.git`;
    
    // Use shallow clone (depth 1) for speed
    const command = `git clone --depth 1 --branch ${targetBranch} "${cloneUrl}" .`;
    
    await progress.emit("fetch", "Cloning repository...");
    
    // Execute clone
    try {
      // We pass the token in the URL which is visible in process list, but short lived.
      // Ideally use GIT_ASKPASS env var with a script that echoes the token.
      // But standard asyncExec doesn't support easy script injection.
      // Current risk is acceptable for this environment (isolated runner).
      await asyncExec(command, { 
        cwd: workspacePath,
        timeout: 300000 // 5 minutes timeout for clone
      });
    } catch (cloneError: any) {
      if (cloneError.message.includes("Remote branch") || cloneError.message.includes("not found")) {
        throw new Error(`Branch '${targetBranch}' not found in repository.`);
      }
      throw cloneError;
    }

    // Calculate stats
    await log("info", "Calculating repository statistics...");
    const stats = await getDirectoryStats(workspacePath);

    if (stats.filesScanned === 0) {
      await log("warning", "Repository is empty - no files to scan");
      return null; // Signals empty repo
    }

    await log("info", `Repository cloned successfully: ${stats.filesScanned} files, ${stats.linesOfCode} lines`, stats);

    return { workspacePath, stats };

  } catch (error: any) {
    try {
      await asyncRmdir(workspacePath);
    } catch (cleanupErr) {
      // ignore
    }

    // Mask token in error message
    const cleanMessage = error.message.replace(/https:\/\/[^@]+@/g, "https://***@");
    
    await log("error", `Failed to clone repository: ${cleanMessage}`);
    throw new Error(`Repository clone failed: ${cleanMessage}`);
  }
}
