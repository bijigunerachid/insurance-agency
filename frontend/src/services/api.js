/** Error with a safe, user-facing meaning. Never carries raw server text. */
export class ApiError extends Error {
  constructor(status, code, requestId, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

// The CSRF token lives in memory only (never in storage); the auth context keeps it current.
let csrfToken = null;
let onUnauthenticated = null;

export function setCsrfToken(token) {
  csrfToken = token ?? null;
}

/** Called when the server says the session is gone, so the app can show the login page. */
export function setUnauthenticatedHandler(handler) {
  onUnauthenticated = handler;
}

async function call(method, path, { body, file, signal, acceptStatuses = [] } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (file) {
    headers['Content-Type'] = file.type;
    headers['X-File-Name'] = encodeURIComponent(file.name);
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  if (response.status === 204) return null;
  // Cancelled while the answer was read: still cancelled, never an empty answer.
  const data = await response.json().catch((err) => {
    if (err.name === 'AbortError') throw err;
    return null;
  });
  if (response.ok || acceptStatuses.includes(response.status)) return data;

  const error = new ApiError(
    response.status,
    data?.error?.code ?? 'HTTP_ERROR',
    data?.error?.requestId ?? response.headers.get('X-Request-Id') ?? undefined,
    data?.error?.details,
  );
  if (response.status === 401 && error.code === 'UNAUTHENTICATED') {
    onUnauthenticated?.();
  }
  throw error;
}

export const apiGet = (path, options) => call('GET', path, options);
export const apiPost = (path, body = {}, options) => call('POST', path, { ...options, body });
export const apiSend = (method, path, body = {}, options) =>
  call(method, path, { ...options, body });
/** Sends a file (a scan) as the request body; its name goes in X-File-Name. */
export const apiUpload = (path, file, options) => call('POST', path, { ...options, file });

/**
 * Downloads a file the API builds (a report export): the browser saves it under the name the
 * server gives. Errors come back as ApiError, so REAUTH_REQUIRED can ask for the password again.
 */
export async function apiDownload(path) {
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new ApiError(
      response.status,
      data?.error?.code ?? 'HTTP_ERROR',
      data?.error?.requestId ?? response.headers.get('X-Request-Id') ?? undefined,
      data?.error?.details,
    );
    if (response.status === 401 && error.code === 'UNAUTHENTICATED') onUnauthenticated?.();
    throw error;
  }
  const name =
    /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'export';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
