import type { AiProviderRequest, AiProviderResponse } from "../../domain";
import {
  AiErrorCode,
  AiProviderError,
  isRetryableProviderStatus,
} from "../../domain";
import type { ProviderInterface } from "./provider-interface";
import { env } from "../../../../env";

export class GroqProvider implements ProviderInterface {
  readonly name = "groq";
  private readonly endpoint = "https://api.groq.com/openai/v1/chat/completions";
  private readonly model = env.GROQ_MODEL || "llama-3.3-70b-versatile";

  async generate<TData = unknown>(
    request: AiProviderRequest
  ): Promise<AiProviderResponse<TData>> {
    if (!env.GROQ_API_KEY) {
      throw new AiProviderError({
        code: AiErrorCode.ProviderUnavailable,
        message: "GROQ_API_KEY is not configured",
        retryable: false,
        provider: this.name,
      });
    }

    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.maxTokens ?? 500,
          response_format: request.responseFormat
            ? { type: request.responseFormat }
            : undefined,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.prompt },
          ],
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        throw new AiProviderError({
          code: response.status === 429 ? AiErrorCode.RateLimited : AiErrorCode.ProviderUnavailable,
          message: payload?.error?.message || `Groq provider error (${response.status})`,
          retryable: isRetryableProviderStatus(response.status),
          provider: this.name,
          statusCode: response.status,
          details: payload,
        });
      }

      const rawText = payload?.choices?.[0]?.message?.content;
      if (typeof rawText !== "string" || !rawText.trim()) {
        throw new AiProviderError({
          code: AiErrorCode.InvalidResponse,
          message: "Groq returned empty response content",
          retryable: false,
          provider: this.name,
          details: payload,
        });
      }

      return {
        provider: this.name,
        model: payload?.model || this.model,
        rawText,
        latencyMs: Date.now() - startedAt,
        promptTokens: payload?.usage?.prompt_tokens,
        completionTokens: payload?.usage?.completion_tokens,
      };
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new AiProviderError({
          code: AiErrorCode.Timeout,
          message: `Groq request timed out after ${timeoutMs}ms`,
          retryable: true,
          provider: this.name,
        });
      }

      if (error instanceof AiProviderError) {
        throw error;
      }

      throw new AiProviderError({
        code: AiErrorCode.ProviderUnavailable,
        message: error?.message || "Groq request failed",
        retryable: true,
        provider: this.name,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
