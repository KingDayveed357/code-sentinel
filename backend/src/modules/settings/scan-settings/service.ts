// src/modules/settings/scan-settings.service.ts
// ===================================================================
import type { FastifyInstance } from 'fastify';

export interface ScanSettings {
  id: string;
  user_id: string;
  auto_scan_enabled: boolean;
  auto_scan_on_push: boolean;
  auto_scan_on_pr: boolean;
  auto_scan_schedule: string | null;
  email_notifications: boolean;
  email_on_critical: boolean;
  email_on_scan_complete: boolean;
  email_address: string | null;
  sound_enabled: boolean;
  sound_on_complete: boolean;
  sound_on_critical: boolean;
  default_scan_type: 'quick' | 'full' | 'custom';
  default_scanners: {
    sast: boolean;
    sca: boolean;
    secrets: boolean;
    iac: boolean;
    container: boolean;
  };
  ai_enrichment_enabled: boolean;
  ai_enrichment_min_severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  created_at: string;
  updated_at: string;
}

export class ScanSettingsService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Get user's scan settings (create defaults if not exist)
   */
  async getSettings(userId: string): Promise<ScanSettings> {
    const { data, error } = await this.fastify.supabase
      .from('scan_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Create default settings
      return this.createDefaultSettings(userId);
    }

    return data as ScanSettings;
  }

  /**
   * Update scan settings
   */
  async updateSettings(
    userId: string,
    updates: Partial<Omit<ScanSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<ScanSettings> {
    const { data, error } = await this.fastify.supabase
      .from('scan_settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw this.fastify.httpErrors.internalServerError('Failed to update settings');
    }

    return data as ScanSettings;
  }

  /**
   * Create default settings for new user
   */
  private async createDefaultSettings(userId: string): Promise<ScanSettings> {
    const { data, error } = await this.fastify.supabase
      .from('scan_settings')
      .insert({
        user_id: userId,
        auto_scan_enabled: false,
        auto_scan_on_push: false,
        auto_scan_on_pr: true,
        email_notifications: true,
        email_on_critical: true,
        email_on_scan_complete: false,
        sound_enabled: true,
        sound_on_complete: true,
        sound_on_critical: true,
        default_scan_type: 'quick',
        default_scanners: {
          sast: true,
          sca: false,
          secrets: true,
          iac: false,
          container: false,
        },
        ai_enrichment_enabled: true,
        ai_enrichment_min_severity: 'high',
      })
      .select()
      .single();

    if (error || !data) {
      throw this.fastify.httpErrors.internalServerError('Failed to create settings');
    }

    return data as ScanSettings;
  }

  /**
   * Check if auto-scan should trigger for an event
   */
  async shouldAutoScan(userId: string, eventType: 'push' | 'pull_request'): Promise<boolean> {
    const settings = await this.getSettings(userId);

    if (!settings.auto_scan_enabled) {
      return false;
    }

    if (eventType === 'push' && settings.auto_scan_on_push) {
      return true;
    }

    if (eventType === 'pull_request' && settings.auto_scan_on_pr) {
      return true;
    }

    return false;
  }

  /**
   * Get AI enrichment settings
   */
  async getAISettings(userId: string): Promise<{
    enabled: boolean;
    minSeverity: string;
  }> {
    const settings = await this.getSettings(userId);
    return {
      enabled: settings.ai_enrichment_enabled,
      minSeverity: settings.ai_enrichment_min_severity,
    };
  }
}