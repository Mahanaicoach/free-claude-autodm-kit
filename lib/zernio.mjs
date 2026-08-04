/**
 * Minimal Zernio REST client. Zero dependencies — Node 18+ native fetch only.
 *
 * Base URL and every path here is taken from Zernio's OpenAPI 3.1 spec
 * (https://zernio.com/openapi.yaml). If a call starts failing with a shape
 * error, re-read the spec before patching around it — Zernio ships changes
 * faster than this file does.
 */

const BASE_URL = process.env.ZERNIO_BASE_URL || 'https://zernio.com/api/v1';

export class ZernioError extends Error {
  constructor(message, { status, code, body, path } = {}) {
    super(message);
    this.name = 'ZernioError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.path = path;
  }
}

/** Turns Zernio's error bodies into something a human can act on. */
function explain(status, body, path) {
  const raw = typeof body === 'string' ? body : body?.error || body?.message || '';
  const code = typeof body === 'object' ? body?.code : undefined;

  if (status === 401) {
    return 'API key rejected. Check ZERNIO_API_KEY — create a fresh one at https://zernio.com/dashboard/api-keys';
  }
  if (status === 402) {
    return 'Zernio says this needs a paid plan. The first 2 connected accounts are free; you are probably over that.';
  }
  if (status === 403 && /inbox addon/i.test(raw)) {
    return 'Zernio returned "Inbox addon required". On current usage-based plans the inbox is included — if you see this, your account is on a legacy plan.';
  }
  if (status === 409 && path?.includes('comment-automations')) {
    return 'This post already has an active per-post automation. Update that one instead, or delete it first.';
  }
  if (status === 429) {
    return 'Rate limited. Free tier (0–2 accounts) is 60 requests/min — wait a minute and retry.';
  }
  return raw || `HTTP ${status}`;
}

export class Zernio {
  constructor(apiKey, { baseUrl = BASE_URL } = {}) {
    if (!apiKey) {
      throw new ZernioError(
        'No API key. Set ZERNIO_API_KEY in .env — get one at https://zernio.com/dashboard/api-keys'
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.lastRateLimit = null;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    this.lastRateLimit = {
      limit: res.headers.get('X-RateLimit-Limit'),
      remaining: res.headers.get('X-RateLimit-Remaining'),
      reset: res.headers.get('X-RateLimit-Reset'),
    };

    const text = await res.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = text;
    }

    if (!res.ok) {
      throw new ZernioError(explain(res.status, payload, path), {
        status: res.status,
        code: typeof payload === 'object' ? payload?.code : undefined,
        body: payload,
        path,
      });
    }
    return payload;
  }

  get(path, query) { return this.request('GET', path, { query }); }
  post(path, body, query) { return this.request('POST', path, { body, query }); }
  patch(path, body) { return this.request('PATCH', path, { body }); }
  put(path, body) { return this.request('PUT', path, { body }); }
  del(path, query) { return this.request('DELETE', path, { query }); }

  // ── Profiles & accounts ────────────────────────────────────────────────
  listProfiles() { return this.get('/profiles'); }
  createProfile(name) { return this.post('/profiles', { name }); }
  listAccounts(query) { return this.get('/accounts', query); }

  /** Returns { authUrl } — open it in a browser to finish OAuth. */
  connectUrl(platform, profileId, redirectUrl) {
    return this.get(`/connect/${platform}`, { profileId, redirect_url: redirectUrl });
  }

  listApiKeys() { return this.get('/api-keys'); }

  // ── Comment → DM automations ───────────────────────────────────────────
  listAutomations(profileId) { return this.get('/comment-automations', { profileId }); }
  getAutomation(id) { return this.get(`/comment-automations/${id}`); }
  createAutomation(payload) { return this.post('/comment-automations', payload); }
  updateAutomation(id, patch) { return this.patch(`/comment-automations/${id}`, patch); }
  deleteAutomation(id) { return this.del(`/comment-automations/${id}`); }
  automationLogs(id, query) { return this.get(`/comment-automations/${id}/logs`, query); }

  // ── Comments (the public side) ─────────────────────────────────────────
  listCommentedPosts(query) { return this.get('/inbox/comments', query); }
  getComments(postId, query) { return this.get(`/inbox/comments/${postId}`, query); }
  replyToComment(postId, body) { return this.post(`/inbox/comments/${postId}`, body); }
  deleteComment(postId, query) { return this.del(`/inbox/comments/${postId}`, query); }
  hideComment(postId, commentId, body) {
    return this.post(`/inbox/comments/${postId}/${commentId}/hide`, body);
  }
  likeComment(postId, commentId, body) {
    return this.post(`/inbox/comments/${postId}/${commentId}/like`, body);
  }
  /** One per comment, within 7 days. Instagram + Facebook only. */
  privateReply(postId, commentId, body) {
    return this.post(`/inbox/comments/${postId}/${commentId}/private-reply`, body);
  }

  // ── DMs ────────────────────────────────────────────────────────────────
  listConversations(query) { return this.get('/inbox/conversations', query); }
  getMessages(conversationId, query) {
    return this.get(`/inbox/conversations/${conversationId}/messages`, query);
  }
  sendMessage(conversationId, body) {
    return this.post(`/inbox/conversations/${conversationId}/messages`, body);
  }

  // ── Instagram DM entry points ──────────────────────────────────────────
  getIceBreakers(accountId) { return this.get(`/accounts/${accountId}/instagram-ice-breakers`); }
  setIceBreakers(accountId, iceBreakers) {
    return this.put(`/accounts/${accountId}/instagram-ice-breakers`, { ice_breakers: iceBreakers });
  }
  deleteIceBreakers(accountId) { return this.del(`/accounts/${accountId}/instagram-ice-breakers`); }

  // ── Contacts / follow-up ───────────────────────────────────────────────
  listContacts(query) { return this.get('/contacts', query); }
  listSequences(query) { return this.get('/sequences', query); }
  createSequence(payload) { return this.post('/sequences', payload); }
  activateSequence(id) { return this.post(`/sequences/${id}/activate`, {}); }
  enrollContact(sequenceId, contactId) {
    return this.post(`/sequences/${sequenceId}/enroll`, { contactId });
  }

  // ── Webhooks ───────────────────────────────────────────────────────────
  listWebhooks() { return this.get('/webhooks/settings'); }
  createWebhook(payload) { return this.post('/webhooks/settings', payload); }

  // ── Posts (to find a platformPostId) ───────────────────────────────────
  listPosts(query) { return this.get('/posts', query); }
}

export { BASE_URL };
