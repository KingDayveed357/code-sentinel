// backend/src/modules/integrations/github-app/private-key.ts
import fs from "fs";
import path from "path";
import { env } from "../../../env";

export function getGithubAppPrivateKey(): string {
  const keyPath = path.resolve(process.cwd(), env.GITHUB_APP_PRIVATE_KEY_PATH || "");

  if (!fs.existsSync(keyPath)) {
    throw new Error(`GitHub App private key not found at: ${keyPath}`);
  }

  return fs.readFileSync(keyPath, "utf8");
}
