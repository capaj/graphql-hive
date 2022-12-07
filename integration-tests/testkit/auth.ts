import { createFetch } from '@whatwg-node/fetch';
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import type { InternalApi } from '@hive/server';
import { z } from 'zod';
import { ensureEnv } from './env';

// eslint-disable-next-line no-process-env
const graphqlUrl = process.env.SERVER_URL;

// TODO: use as fallback
// import * as utils from '@n1ru4l/dockest/test-helper';
// const graphqlUrl = utils.getServiceAddress('server', 3001);

const { fetch } = createFetch({
  useNodeFetch: true,
});

const internalApi = createTRPCProxyClient<InternalApi>({
  links: [
    httpLink({
      url: `${graphqlUrl}/trpc`,
      fetch,
    }),
  ],
});

const SignUpSignInUserResponseModel = z.object({
  status: z.literal('OK'),
  user: z.object({ email: z.string(), id: z.string(), timeJoined: z.number() }),
});

const signUpUserViaEmail = async (
  email: string,
  password: string,
): Promise<z.TypeOf<typeof SignUpSignInUserResponseModel>> => {
  const response = await fetch(`${ensureEnv('SUPERTOKENS_CONNECTION_URI')}/recipe/signup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'api-key': ensureEnv('SUPERTOKENS_API_KEY'),
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`Signup failed. ${response.status}.\n ${body}`);
  }

  const data = JSON.parse(body);

  return SignUpSignInUserResponseModel.parse(data);
};

const createSessionPayload = (superTokensUserId: string, email: string) => ({
  version: '1',
  superTokensUserId,
  externalUserId: null,
  email,
});

const CreateSessionModel = z.object({
  accessToken: z.object({
    token: z.string(),
  }),
  refreshToken: z.object({
    token: z.string(),
  }),
  idRefreshToken: z.object({
    token: z.string(),
  }),
});

const createSession = async (
  superTokensUserId: string,
  email: string,
  oidcIntegrationId: string | null,
) => {
  await internalApi.ensureUser.mutate({
    superTokensUserId,
    email,
    oidcIntegrationId,
  });

  const sessionData = createSessionPayload(superTokensUserId, email);
  const payload = {
    enableAntiCsrf: false,
    userId: superTokensUserId,
    userDataInDatabase: sessionData,
    userDataInJWT: sessionData,
  };

  const response = await fetch(`${ensureEnv('SUPERTOKENS_CONNECTION_URI')}/recipe/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'api-key': ensureEnv('SUPERTOKENS_API_KEY'),
      rid: 'session',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`Create session failed. ${response.status}.\n ${body}`);
  }

  const data = CreateSessionModel.parse(JSON.parse(body));

  /**
   * These are the required cookies that need to be set.
   */
  return {
    access_token: data.accessToken.token,
  };
};

const password = 'ilikebigturtlesandicannotlie47';

export function userEmail(userId: string) {
  return `${userId}@localhost.localhost`;
}

const tokenResponsePromise: {
  [key: string]: Promise<z.TypeOf<typeof SignUpSignInUserResponseModel>> | null;
} = {};

export function authenticate(userId: string): Promise<{ access_token: string }>;
export function authenticate(
  userId: string,
  oidcIntegrationId?: string,
): Promise<{ access_token: string }>;
export function authenticate(
  userId: string | string,
  oidcIntegrationId?: string,
): Promise<{ access_token: string }> {
  if (!tokenResponsePromise[userId]) {
    tokenResponsePromise[userId] = signUpUserViaEmail(userEmail(userId), password);
  }

  return tokenResponsePromise[userId]!.then(data =>
    createSession(data.user.id, data.user.email, oidcIntegrationId ?? null),
  );
}
