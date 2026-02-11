// src/modules/vulnerabilities-unified/schemas.ts
export const listVulnerabilitiesSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId"],
  },
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", default: 1 },
      limit: { type: "integer", default: 15 },
      severity: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      status: { type: "string" },
      scanner_type: { type: "string" },
      assigned_to: { type: "string" },
      search: { type: "string" },
      sort: { type: "string", enum: ["severity", "recent", "oldest", "confidence"] },
    },
  },
  tags: ["vulnerabilities-unified"],
  summary: "Get all vulnerabilities",
  description: "Get all vulnerabilities for a workspace with filtering and pagination",
};

export const getVulnerabilityStatsSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId"],
  },
  tags: ["vulnerabilities-unified"],
  summary: "Get vulnerability statistics",
  description: "Get aggregated statistics for vulnerabilities in a workspace",
};

export const getVulnerabilityDetailsSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      vulnId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "vulnId"],
  },
  querystring: {
    type: "object",
    properties: {
      include: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      instances_page: { type: "string" },
      instances_limit: { type: "string" },
    },
  },
  tags: ["vulnerabilities-unified"],
  summary: "Get vulnerability details",
  description:
    "Get detailed information about a specific vulnerability with optional includes (instances, ai_explanation, risk_context, related_issues)",
};

export const updateVulnerabilityStatusSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      vulnId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "vulnId"],
  },
  body: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["open", "in_review", "fixed", "false_positive", "wont_fix", "accepted", "ignored"] },
      note: { type: "string" },
    },
    required: ["status"],
  },
  tags: ["vulnerabilities-unified"],
  summary: "Update vulnerability status",
  description: "Update the status of a vulnerability",
};

export const assignVulnerabilitySchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      vulnId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "vulnId"],
  },
  body: {
    type: "object",
    properties: {
      assigned_to: { type: ["string", "null"] },
    },
    required: ["assigned_to"],
  },
  tags: ["vulnerabilities-unified"],
  summary: "Assign vulnerability",
  description: "Assign a vulnerability to a team member",
};

export const generateAIExplanationSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      vulnId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "vulnId"],
  },
  body: {
    type: "object",
    properties: {
      regenerate: { type: "boolean", default: false },
    },
  },
  tags: ["vulnerabilities-unified"],
  summary: "Generate AI explanation",
  description: "Generate or regenerate AI explanation for a vulnerability",
};

export const createGitHubIssueSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      vulnId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "vulnId"],
  },
  tags: ["vulnerabilities-unified"],
  summary: "Create GitHub issue",
  description: "Create a GitHub issue for a specific vulnerability",
};
