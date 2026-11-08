import { getIdToken } from '../auth';
import { loadConfig } from '../config';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { apiUrl } = await loadConfig();
  const token = await getIdToken();
  const response = await fetch(apiUrl + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error ?? 'error',
      payload.message ?? response.statusText,
    );
  }
  return payload as T;
}
