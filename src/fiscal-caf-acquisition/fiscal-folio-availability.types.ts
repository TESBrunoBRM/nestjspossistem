import { TipoDTE, type IssuerContext } from 'sii-engine';

export interface FolioAvailabilityRequest {
  context: IssuerContext;
  tipoDTE: TipoDTE;
  method?: string;
}

export interface FolioAvailabilityResult {
  requestId: string;
  status: 'available' | 'manual_action_required' | 'failed' | string;
  method: string;
  context: IssuerContext;
  tipoDTE: TipoDTE;
  quantityProbed: number;
  availableFolios?: number;
  maxAuthorizedFolios?: number;
  requestedAt: Date;
  completedAt?: Date;
  detail?: string;
  retryable?: boolean;
}

export interface FolioAvailabilityProvider {
  queryAvailableFolios(
    request: FolioAvailabilityRequest,
  ): Promise<FolioAvailabilityResult>;
}

export function toPublicFolioAvailabilityResult(
  result: FolioAvailabilityResult,
): Record<string, unknown> {
  return compact({
    requestId: result.requestId,
    status: result.status,
    method: result.method,
    rutEmisor: result.context.rutEmisor,
    environment: result.context.environment,
    tipoDTE: result.tipoDTE,
    quantityProbed: result.quantityProbed,
    availableFolios: result.availableFolios,
    maxAuthorizedFolios: result.maxAuthorizedFolios,
    requestedAt: result.requestedAt,
    completedAt: result.completedAt,
    detail: result.detail,
    retryable: result.retryable,
  });
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
