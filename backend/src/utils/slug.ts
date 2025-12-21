// =====================================================
// utils/slug.ts
// Generate URL-friendly slugs from team names
// =====================================================

/**
 * Generate a URL-friendly slug from a string
 * 
 * Examples:
 * "Engineering Team" -> "engineering-team"
 * "Acme Corp (USA)" -> "acme-corp-usa"
 * "DevOps & Security" -> "devops-security"
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove special characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length to 50 characters
    .substring(0, 50);
}

/**
 * Generate a unique slug by appending a random suffix if needed
 * 
 * Example:
 * "engineering-team" -> "engineering-team-a3f9"
 */
export function generateUniqueSlug(baseSlug: string): string {
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${baseSlug}-${randomSuffix}`;
}

/**
 * Validate slug format
 * Must be lowercase alphanumeric with hyphens, 3-50 characters
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$/.test(slug);
}
