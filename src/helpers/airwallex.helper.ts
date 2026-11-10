import { request, type APIRequestContext } from '@playwright/test';
import { AWX } from '../fixtures/airwallex';

/** Shape of a simulated issuing transaction returned by the AWX simulation API. */
export interface AwxTransaction {
  transaction_id: string;
  status: string;           // APPROVED | PENDING | FAILED
  transaction_type: string; // CLEARING | AUTHORIZATION | REVERSAL | ORIGINAL_CREDIT
  transaction_amount: number;
  transaction_currency: string;
  billing_amount?: number;
  billing_currency?: string;
  failure_reason?: string;
  lifecycle_id?: string;
}

export interface CreateTransactionBody {
  /** Defaults to AWX.cardId when omitted. */
  card_id?: string;
  merchant_category_code: string;
  merchant_info: string;
  transaction_amount: number;
  transaction_currency: string;
  /** true = auth + capture in one go (CLEARING); false = AUTHORIZATION only (PENDING). */
  single_phase?: boolean;
  /** Set to simulate a declined transaction, e.g. CVV_INVALID / TRANSACTION_BLOCKED. */
  transaction_failure_reason?: string;
  /** Links an incremental authorization to an existing transaction lifecycle. */
  transaction_id?: string;
}

export interface AwxResult {
  status: number;
  body: AwxTransaction;
}

/**
 * Auth, matching the "Naut Airwallex Public API" collection's Authentication folder:
 *
 *  1. POST /api/v1/authentication/login   — x-client-id + x-api-key → { token, expires_at }
 *  2. POST /api/v1/sca_sessions/authorize — Bearer <token from step 1> → an SCA-elevated
 *     { token, expires_at }. Required for privileged operations on some accounts;
 *     enable with AWX_REQUIRE_SCA=true.
 */
/** POST an auth endpoint and extract the { token } from its response. */
async function fetchToken(what: string, path: string, headers: Record<string, string>): Promise<string> {
  const ctx = await request.newContext({ baseURL: AWX.baseURL });
  try {
    const res = await ctx.post(path, { headers: { ...headers, 'Content-Type': 'application/json' } });
    if (!res.ok()) {
      throw new Error(`Airwallex ${what} failed: ${res.status()} ${await res.text()}`);
    }
    const { token } = await res.json();
    if (!token) throw new Error(`Airwallex ${what} returned no token`);
    return token;
  } finally {
    await ctx.dispose();
  }
}

async function login(): Promise<string> {
  if (!AWX.clientId || !AWX.apiKey) {
    throw new Error(
      'Airwallex credentials missing — set AWX_BEARER_TOKEN, or AWX_CLIENT_ID + AWX_API_KEY, in .env'
    );
  }
  return fetchToken('login', '/api/v1/authentication/login', {
    'x-client-id': AWX.clientId,
    'x-api-key': AWX.apiKey,
  });
}

/** Exchange a login token for an SCA-elevated token. */
async function authorizeSca(loginToken: string): Promise<string> {
  return fetchToken('SCA authorize', '/api/v1/sca_sessions/authorize', {
    Authorization: `Bearer ${loginToken}`,
  });
}

async function resolveBearerToken(): Promise<string> {
  // A pasted token is used as-is — assumed already SCA-elevated if the account needs it.
  if (AWX.bearerToken) return AWX.bearerToken;

  const token = await login();
  return AWX.requireSca ? authorizeSca(token) : token;
}

/**
 * Thin client over the AWX issuing *simulation* endpoints. Mirrors the shared
 * Postman collection ("Airwallex Issuing — Payment Scenarios") 1:1.
 */
export class AirwallexClient {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(): Promise<AirwallexClient> {
    const token = await resolveBearerToken();
    const ctx = await request.newContext({
      baseURL: AWX.baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-api-version': AWX.apiVersion,
        'x-on-behalf-of': AWX.connectedAccountId,
      },
    });
    return new AirwallexClient(ctx);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async post(url: string, data: Record<string, unknown>): Promise<AwxResult> {
    const res = await this.ctx.post(url, { data });
    const raw = await res.text();
    // Fail loudly on HTTP errors — an error body is not an AwxTransaction, and
    // letting it through surfaced as confusing `body.status === undefined` asserts.
    if (res.status() >= 400) {
      throw new Error(`AWX ${url} failed: ${res.status()} ${raw}`);
    }
    let body: AwxTransaction;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(`AWX ${url} returned non-JSON (${res.status()}): ${raw}`);
    }
    return { status: res.status(), body };
  }

  /** POST /api/v1/simulation/issuing/create */
  createTransaction(body: CreateTransactionBody): Promise<AwxResult> {
    return this.post('/api/v1/simulation/issuing/create', {
      card_id: AWX.cardId,
      ...body,
    });
  }

  /** POST /api/v1/simulation/issuing/{id}/capture */
  capture(transactionId: string, amount: number): Promise<AwxResult> {
    return this.post(`/api/v1/simulation/issuing/${transactionId}/capture`, {
      transaction_amount: amount,
    });
  }

  /** POST /api/v1/simulation/issuing/{id}/reverse */
  reverse(transactionId: string, amount: number): Promise<AwxResult> {
    return this.post(`/api/v1/simulation/issuing/${transactionId}/reverse`, {
      transaction_amount: amount,
    });
  }

  /** POST /api/v1/simulation/issuing/refund */
  refund(transactionId: string, amount: number, currency: string, cardId = AWX.cardId): Promise<AwxResult> {
    return this.post('/api/v1/simulation/issuing/refund', {
      card_id: cardId,
      transaction_amount: amount,
      transaction_currency: currency,
      transaction_id: transactionId,
    });
  }
}
