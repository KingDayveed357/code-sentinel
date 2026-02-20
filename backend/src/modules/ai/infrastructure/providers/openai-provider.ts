import type { AiProviderRequest, AiProviderResponse } from "../../domain";
import {
  AiErrorCode,
  AiProviderError,
  isRetryableProviderStatus,
} from "../../domain";
import type { ProviderInterface } from "./provider-interface";
import { env } from "../../../../env";

export class OpenAiProvider implements ProviderInterface {
  readonly name = "openai";
  private readonly endpoint = "https://api.openai.com/v1/chat/completions";
  private readonly model = env.OPENAI_MODEL || "gpt-4o-mini";

  async generate<TData = unknown>(
    request: AiProviderRequest
  ): Promise<AiProviderResponse<TData>> {
    if (!env.OPENAI_API_KEY) {
      throw new AiProviderError({
        code: AiErrorCode.ProviderUnavailable,
        message: "OPENAI_API_KEY is not configured",
        retryable: false,
        provider: this.name,
      });
    }

    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const responseFormat =
      request.responseFormat === "json_schema" && request.responseSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: request.responseSchema.name,
              schema: request.responseSchema.schema,
              strict: request.responseSchema.strict ?? true,
            },
          }
        : request.responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined;

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.maxTokens ?? 500,
          response_format: responseFormat,
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
          message: payload?.error?.message || `OpenAI provider error (${response.status})`,
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
          message: "OpenAI returned empty response content",
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
          message: `OpenAI request timed out after ${timeoutMs}ms`,
          retryable: true,
          provider: this.name,
        });
      }

      if (error instanceof AiProviderError) {
        throw error;
      }

      throw new AiProviderError({
        code: AiErrorCode.ProviderUnavailable,
        message: error?.message || "OpenAI request failed",
        retryable: true,
        provider: this.name,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
