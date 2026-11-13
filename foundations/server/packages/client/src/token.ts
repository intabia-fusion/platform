import { type Token, decodeToken } from '@hcengineering/server-token'
import { type IncomingHttpHeaders } from 'http'

const extractCookieTokens = (cookie?: string): string[] => {
  if (cookie === undefined || cookie === null) {
    return []
  }

  const cookies = cookie.split(';')
  return cookies
    .filter((cookie) => cookie.toLowerCase().includes('token'))
    .map((cookie) => cookie.split('=')[1])
    .filter((token): token is string => token !== undefined)
}

const extractAuthorizationToken = (authorization?: string): string | null => {
  if (authorization === undefined || authorization === null) {
    return null
  }
  const encodedToken = authorization.split(' ')[1]

  if (encodedToken === undefined) {
    return null
  }

  return encodedToken
}

/**
 * Returns the raw token string from Authorization header or first matching cookie.
 * Does NOT decode the token - useful for API key validation or when you need the raw string.
 * Prefers Authorization header, falls back to first cookie containing 'token'.
 */
export function readToken (headers: IncomingHttpHeaders): string | undefined {
  // First try Authorization header
  const authToken = extractAuthorizationToken(headers.authorization)
  if (authToken !== null) {
    return authToken
  }

  // Then return the first cookie with 'token' in the name (without decoding)
  const cookieTokens = extractCookieTokens(headers.cookie)
  return cookieTokens[0]
}

/**
 * A decoded token and the string it was decoded from. The two must travel together: the raw is sent
 * to account, and picking it another way (`readToken` takes the first cookie) can send a token of
 * one account while the decoded one names another.
 */
export interface ExtractedToken {
  token: Token
  raw: string
}

/**
 * Extracts and decodes JWT token from Authorization header or cookies, keeping the raw string.
 * Prefers tokens with workspace from cookies, exactly like `extractToken`.
 * Returns undefined if token cannot be decoded.
 */
export function extractTokenWithRaw (headers: IncomingHttpHeaders): ExtractedToken | undefined {
  // First try Authorization header
  const authToken = extractAuthorizationToken(headers.authorization)
  if (authToken !== null) {
    try {
      return { token: decodeToken(authToken), raw: authToken }
    } catch {
      // Not a valid JWT
      return undefined
    }
  }

  // Then try all cookies with 'token' in the name
  const cookieTokens = extractCookieTokens(headers.cookie)
  let validToken: ExtractedToken | undefined
  for (const raw of cookieTokens) {
    try {
      const decoded = decodeToken(raw)
      // Prefer token with workspace, return immediately if found
      if (decoded.workspace !== undefined) {
        return { token: decoded, raw }
      }
      // Keep first valid token without workspace as fallback
      validToken ??= { token: decoded, raw }
    } catch {
      // Continue to next token
    }
  }

  return validToken
}

/**
 * Extracts and decodes JWT token from Authorization header or cookies.
 * Prefers tokens with workspace from cookies.
 * Returns undefined if token cannot be decoded.
 */
export function extractToken (headers: IncomingHttpHeaders): Token | undefined {
  return extractTokenWithRaw(headers)?.token
}
