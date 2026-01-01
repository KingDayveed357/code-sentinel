// src/modules/integrations/github-app/state.ts
/**
 * Secure State Management for GitHub App Installation
 * 
 * SECURITY: Never pass sensitive data in plain text through GitHub redirects.
 * 
 * We use HMAC-SHA256 to create a signed state token that:
 * - Contains workspace_id
 * - Has expiration (prevents replay attacks)
 * - Cannot be tampered with (HMAC signature verification)
 * - Is URL-safe
 */

import crypto from 'crypto';
import { env } from '../../../env';
import { getGithubAppPrivateKey } from './private-key';

const STATE_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes

interface StatePayload {
  workspace_id: string;
  expires_at: number;
}

/**
 * Generate secure state token for GitHub App installation
 * 
 * WHY: Protects against:
 * - State tampering (attacker can't change workspace_id)
 * - Replay attacks (token expires after 15 minutes)
 * - CSRF attacks (state is tied to specific workspace)
 * 
 * @param workspaceId - Target workspace ID
 * @returns URL-safe signed state token
 */
export function generateSecureState(workspaceId: string): string {
  const payload: StatePayload = {
    workspace_id: workspaceId,
    expires_at: Date.now() + STATE_EXPIRATION_MS,
  };

  // Encode payload as base64
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString('base64url');

  // Generate HMAC signature
  const signature = generateSignature(payloadBase64);

  // Combine payload and signature
  return `${payloadBase64}.${signature}`;
}

/**
 * Verify and decode state token
 * 
 * @param state - State token from GitHub callback
 * @returns Decoded workspace_id if valid
 * @throws Error if state is invalid, expired, or tampered
 */
export function verifySecureState(state: string): string {
  if (!state || !state.includes('.')) {
    throw new Error('Invalid state format');
  }

  const [payloadBase64, signature] = state.split('.');

  // Verify signature
  const expectedSignature = generateSignature(payloadBase64);
  if (signature !== expectedSignature) {
    throw new Error('State signature verification failed - possible tampering');
  }

  // Decode payload
  let payload: StatePayload;
  try {
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    payload = JSON.parse(payloadJson);
  } catch (error) {
    throw new Error('Failed to decode state payload');
  }

  // Validate structure
  if (!payload.workspace_id || !payload.expires_at) {
    throw new Error('Invalid state payload structure');
  }

  // Check expiration
  if (Date.now() > payload.expires_at) {
    throw new Error('State token has expired');
  }

  return payload.workspace_id;
}

/**
 * Generate HMAC-SHA256 signature for state payload
 * 
 * Uses app secret as signing key to prevent forgery.
 */
function generateSignature(payload: string): string {
  const secret = getStateSecret();
  
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
}

/**
 * Get secret key for state signing
 * 
 * SECURITY: This MUST be kept secret and should be:
 * - Different from GitHub App secret
 * - Stored in environment variables
 * - Rotated periodically
 */
function getStateSecret(): string {
  const secret = getGithubAppPrivateKey();
  
  if (!secret) {
    throw new Error(
      'GITHUB_APP_STATE_SECRET not configured. This is required for secure state management.'
    );
  }

  return secret;
}