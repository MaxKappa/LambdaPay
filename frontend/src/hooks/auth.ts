import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect, useState } from 'react';
import { parseJwt } from '../utils/jwt';

export function useAuthToken(): string | undefined {
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function fetchToken() {
      try {
        const session = await fetchAuthSession();
        setAuthToken(session.tokens?.idToken?.toString());
      } catch (error) {
        setAuthToken(undefined);
      }
    }
    fetchToken();
  }, []);

  return authToken;
}

export interface CognitoIdTokenPayload {
  sub: string;
  email_verified: boolean;
  birthdate: string;
  iss: string;
  phone_number_verified: boolean;
  'cognito:username': string;
  given_name: string;
  origin_jti: string;
  aud: string;
  event_id: string;
  token_use: 'id' | 'access' | 'refresh';
  auth_time: number;
  name: string;
  phone_number: string;
  exp: number;
  iat: number;
  jti: string;
  email: string;
}

export interface UserDetails {
  id: string;
  username: string;
  fullName: string;
  email: string;
  emailVerified: boolean;
  birthdate: string;
  phone?: string;
  phoneVerified: boolean;
  issuedAt: Date;
  expiresAt: Date;
}

export function getUserDetailsFromToken(token: string): UserDetails {
  const p = parseJwt<CognitoIdTokenPayload>(token);

  return {
    id: p.sub,
    username: p['cognito:username'],
    fullName: p.name,
    email: p.email,
    emailVerified: p.email_verified,
    birthdate: p.birthdate,
    phone: p.phone_number,
    phoneVerified: p.phone_number_verified,
    issuedAt: new Date(p.iat * 1000),
    expiresAt: new Date(p.exp * 1000),
  };
}


