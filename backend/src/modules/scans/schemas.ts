
export const listScansSchema = {
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
      limit: { type: "integer", default: 10 },
      sort: { type: "string", enum: ["recent", "oldest", "duration"] },
      status: { type: "string" },
      repository_id: { type: "string", format: "uuid" },
      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
    },
  },
  tags: ["scans"],
};

export const startScanSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId"],
  },
  body: {
    type: "object",
    properties: {
      repositoryId: { type: "string", format: "uuid" },
      branch: { type: "string" },
      scanType: { type: "string", enum: ["quick", "full"] },
    },
    required: ["repositoryId", "branch"],
  },
  tags: ["scans"],
};

export const getScanStatsSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId"],
  },
  tags: ["scans"],
};

export const getScanDetailsSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      scanId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "scanId"],
  },
  tags: ["scans"],
};

export const cancelScanSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      scanId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "scanId"],
  },
  tags: ["scans"],
};

export const exportScanResultsSchema = {
  params: {
    type: "object",
    properties: {
      workspaceId: { type: "string", format: "uuid" },
      scanId: { type: "string", format: "uuid" },
    },
    required: ["workspaceId", "scanId"],
  },
  querystring: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["json", "csv"] },
    },
    required: ["format"],
  },
  tags: ["scans"],
};
