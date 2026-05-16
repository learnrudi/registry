import {
  createPlaidClient,
  getPlaidRuntimeConfig,
} from "../api/client.js";
import {
  CompleteHostedLinkInputSchema,
  CreateHostedLinkInputSchema,
  ExchangePublicTokenInputSchema,
  type CompleteHostedLinkInput,
  type CreateHostedLinkInput,
  type ExchangePublicTokenInput,
} from "../schemas.js";
import { saveLinkedItem, type PublicTokenRecord } from "./tokens.js";

export interface HostedLinkTokenResult {
  linkToken: string;
  hostedLinkUrl: string;
  expiration: string;
  requestId?: string;
}

export interface PublicTokenCandidate {
  publicToken: string;
  linkSessionId?: string;
  institutionId?: string;
  institutionName?: string;
}

export interface ExchangePublicTokenResult {
  item: PublicTokenRecord;
  itemId: string;
}

export interface HostedLinkStatus {
  expiration?: string;
  createdAt?: string;
  linkSessionsCount: number;
  sessions: Array<{
    linkSessionId?: string;
    startedAt?: string;
    finishedAt?: string;
    institution?: { institutionId?: string; name?: string };
    status?: string;
    exit?: {
      errorType?: string;
      errorCode?: string;
      errorMessage?: string;
      displayMessage?: string;
      requestId?: string;
      institution?: { institutionId?: string; name?: string };
      status?: string;
    };
    success?: {
      hasPublicToken: boolean;
      institution?: { institutionId?: string; name?: string };
      accounts?: number;
    };
    itemAddResults?: Array<{
      hasPublicToken: boolean;
      institution?: { institutionId?: string; name?: string };
    }>;
    events?: Array<{
      name?: string;
      timestamp?: string;
      institutionId?: string;
      institutionName?: string;
      errorType?: string;
      errorCode?: string;
      errorMessage?: string;
      exitStatus?: string;
      requestId?: string;
    }>;
  }>;
}

function buildHostedLinkObject(
  input: ReturnType<typeof CreateHostedLinkInputSchema.parse>
): Record<string, unknown> {
  const hostedLink: Record<string, unknown> = {};
  if (input.hostedLinkUrlLifetimeSeconds) {
    hostedLink.url_lifetime_seconds = input.hostedLinkUrlLifetimeSeconds;
  }
  if (input.completionRedirectUri) {
    hostedLink.completion_redirect_uri = input.completionRedirectUri;
  }
  return hostedLink;
}

export async function createHostedLinkToken(
  rawInput: CreateHostedLinkInput = {}
): Promise<HostedLinkTokenResult> {
  const input = CreateHostedLinkInputSchema.parse(rawInput);
  const client = createPlaidClient();

  const user: Record<string, unknown> = {
    client_user_id: input.clientUserId,
  };
  if (input.userPhoneNumber) {
    user.phone_number = input.userPhoneNumber;
  }
  if (input.userEmailAddress) {
    user.email_address = input.userEmailAddress;
  }

  const request: Record<string, unknown> = {
    user,
    client_name: input.clientName,
    products: input.products,
    country_codes: input.countryCodes,
    language: input.language,
    hosted_link: buildHostedLinkObject(input),
  };

  const linkCustomizationName =
    input.linkCustomizationName || process.env.PLAID_LINK_CUSTOMIZATION_NAME;
  if (linkCustomizationName) {
    request.link_customization_name = linkCustomizationName;
  }

  if (input.webhook) {
    request.webhook = input.webhook;
  }
  if (input.redirectUri) {
    request.redirect_uri = input.redirectUri;
  }
  if (input.products.includes("transactions")) {
    request.transactions = { days_requested: input.daysRequested };
  }

  const response = await client.linkTokenCreate(request as never);
  const data = response.data as {
    link_token: string;
    hosted_link_url?: string;
    expiration: string;
    request_id?: string;
  };

  if (!data.hosted_link_url) {
    throw new Error(
      "Plaid did not return hosted_link_url. Ensure hosted_link is enabled in the link token request."
    );
  }

  return {
    linkToken: data.link_token,
    hostedLinkUrl: data.hosted_link_url,
    expiration: data.expiration,
    requestId: data.request_id,
  };
}

function extractPublicTokenCandidates(data: unknown): PublicTokenCandidate[] {
  const response = data as {
    link_sessions?: Array<{
      link_session_id?: string;
      on_success?: {
        public_token?: string;
        metadata?: {
          institution?: { institution_id?: string; name?: string };
        };
      };
      results?: {
        item_add_results?: Array<{
          public_token?: string;
          institution?: { institution_id?: string; name?: string };
        }>;
      };
      events?: Array<{
        event_name?: string;
        timestamp?: string;
        event_metadata?: {
          institution_id?: string;
          institution_name?: string;
          error_type?: string;
          error_code?: string;
          error_message?: string;
          exit_status?: string;
          request_id?: string;
        };
      }>;
    }>;
  };

  const candidates: PublicTokenCandidate[] = [];

  for (const session of response.link_sessions || []) {
    for (const result of session.results?.item_add_results || []) {
      if (result.public_token) {
        candidates.push({
          publicToken: result.public_token,
          linkSessionId: session.link_session_id,
          institutionId: result.institution?.institution_id,
          institutionName: result.institution?.name,
        });
      }
    }

    if (session.on_success?.public_token) {
      candidates.push({
        publicToken: session.on_success.public_token,
        linkSessionId: session.link_session_id,
        institutionId:
          session.on_success.metadata?.institution?.institution_id,
        institutionName: session.on_success.metadata?.institution?.name,
      });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.publicToken)) {
      return false;
    }
    seen.add(candidate.publicToken);
    return true;
  });
}

export async function getHostedLinkPublicTokens(
  linkToken: string
): Promise<PublicTokenCandidate[]> {
  const client = createPlaidClient();
  const response = await client.linkTokenGet({ link_token: linkToken });
  return extractPublicTokenCandidates(response.data);
}

export async function getHostedLinkStatus(
  linkToken: string
): Promise<HostedLinkStatus> {
  const client = createPlaidClient();
  const response = await client.linkTokenGet({ link_token: linkToken });
  const data = response.data as {
    expiration?: string;
    created_at?: string;
    link_sessions?: Array<{
      link_session_id?: string;
      started_at?: string;
      finished_at?: string;
      institution?: { institution_id?: string; name?: string };
      status?: string;
      on_exit?: {
        error?: {
          error_type?: string;
          error_code?: string;
          error_message?: string;
          display_message?: string;
          request_id?: string;
        };
        metadata?: {
          institution?: { institution_id?: string; name?: string };
          status?: string;
        };
      };
      on_success?: {
        public_token?: string;
        metadata?: {
          institution?: { institution_id?: string; name?: string };
          accounts?: unknown[];
        };
      };
      results?: {
        item_add_results?: Array<{
          public_token?: string;
          institution?: { institution_id?: string; name?: string };
        }>;
      };
      events?: Array<{
        event_name?: string;
        timestamp?: string;
        event_metadata?: {
          institution_id?: string;
          institution_name?: string;
          error_type?: string;
          error_code?: string;
          error_message?: string;
          exit_status?: string;
          request_id?: string;
        };
      }>;
    }>;
  };

  return {
    expiration: data.expiration,
    createdAt: data.created_at,
    linkSessionsCount: data.link_sessions?.length || 0,
    sessions: (data.link_sessions || []).map((session) => ({
      linkSessionId: session.link_session_id,
      startedAt: session.started_at,
      finishedAt: session.finished_at,
      institution: session.institution
        ? {
            institutionId: session.institution.institution_id,
            name: session.institution.name,
          }
        : undefined,
      status: session.status,
      exit: session.on_exit
        ? {
            errorType: session.on_exit.error?.error_type,
            errorCode: session.on_exit.error?.error_code,
            errorMessage: session.on_exit.error?.error_message,
            displayMessage: session.on_exit.error?.display_message,
            requestId: session.on_exit.error?.request_id,
            institution: session.on_exit.metadata?.institution
              ? {
                  institutionId:
                    session.on_exit.metadata.institution.institution_id,
                  name: session.on_exit.metadata.institution.name,
                }
              : undefined,
            status: session.on_exit.metadata?.status,
          }
        : undefined,
      success: session.on_success
        ? {
            hasPublicToken: Boolean(session.on_success.public_token),
            institution: session.on_success.metadata?.institution
              ? {
                  institutionId:
                    session.on_success.metadata.institution.institution_id,
                  name: session.on_success.metadata.institution.name,
                }
              : undefined,
            accounts: session.on_success.metadata?.accounts?.length,
          }
        : undefined,
      itemAddResults: session.results?.item_add_results?.map((result) => ({
        hasPublicToken: Boolean(result.public_token),
        institution: result.institution
          ? {
              institutionId: result.institution.institution_id,
              name: result.institution.name,
            }
          : undefined,
      })),
      events: session.events?.map((event) => ({
        name: event.event_name,
        timestamp: event.timestamp,
        institutionId: event.event_metadata?.institution_id,
        institutionName: event.event_metadata?.institution_name,
        errorType: event.event_metadata?.error_type,
        errorCode: event.event_metadata?.error_code,
        errorMessage: event.event_metadata?.error_message,
        exitStatus: event.event_metadata?.exit_status,
        requestId: event.event_metadata?.request_id,
      })),
    })),
  };
}

export async function exchangePublicToken(
  rawInput: ExchangePublicTokenInput
): Promise<ExchangePublicTokenResult> {
  const input = ExchangePublicTokenInputSchema.parse(rawInput);
  const runtimeConfig = getPlaidRuntimeConfig();
  const client = createPlaidClient(runtimeConfig);
  const tokenResponse = await client.itemPublicTokenExchange({
    public_token: input.publicToken,
  });

  const accessToken = tokenResponse.data.access_token;
  const itemId = tokenResponse.data.item_id;
  const itemResponse = await client
    .itemGet({ access_token: accessToken })
    .catch(() => null);
  const item = itemResponse?.data.item;

  const publicRecord = await saveLinkedItem({
    itemId,
    accessToken,
    environment: runtimeConfig.environment,
    label: input.label,
    institutionId: item?.institution_id || undefined,
    products: item?.products || [],
  });

  return { item: publicRecord, itemId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function completeHostedLink(
  rawInput: CompleteHostedLinkInput
): Promise<{ items: PublicTokenRecord[]; publicTokenCount: number }> {
  const input = CompleteHostedLinkInputSchema.parse(rawInput);
  const deadline = Date.now() + input.timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const candidates = await getHostedLinkPublicTokens(input.linkToken);
    if (candidates.length > 0) {
      const items: PublicTokenRecord[] = [];
      for (const candidate of candidates) {
        const exchanged = await exchangePublicToken({
          publicToken: candidate.publicToken,
          label: input.label || candidate.institutionName,
        });
        items.push(exchanged.item);
      }
      return { items, publicTokenCount: candidates.length };
    }

    await sleep(input.pollIntervalSeconds * 1000);
  }

  throw new Error(
    `Timed out waiting for Hosted Link completion after ${input.timeoutSeconds} seconds.`
  );
}
