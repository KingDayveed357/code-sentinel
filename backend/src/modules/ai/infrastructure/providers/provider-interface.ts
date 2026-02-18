import type { AiProviderRequest, AiProviderResponse } from "../../domain";

export interface ProviderInterface {
  readonly name: string;
  generate<TData = unknown>(request: AiProviderRequest): Promise<AiProviderResponse<TData>>;
}
