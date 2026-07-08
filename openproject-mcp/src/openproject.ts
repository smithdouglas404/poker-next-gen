/** OpenProject REST API v3 client — used only for the write-back path
 *  (posting the review as an activity comment), since the OpenProject MCP
 *  server is read-only. */

export interface RestClient {
  postComment(workPackageId: string, comment: string): Promise<void>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Build the request for posting a work-package activity comment. Pure + testable. */
export function buildCommentRequest(
  baseUrl: string,
  workPackageId: string,
  comment: string,
  token: string,
): { url: string; init: RequestInit } {
  const base = baseUrl.replace(/\/$/, "");
  // OpenProject uses HTTP Basic with username "apikey" and the token as password.
  const auth = Buffer.from(`apikey:${token}`).toString("base64");
  return {
    url: `${base}/api/v3/work_packages/${encodeURIComponent(workPackageId)}/activities`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ comment: { raw: comment } }),
    },
  };
}

export function createRestClient(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
}): RestClient {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  return {
    async postComment(workPackageId, comment) {
      if (!opts.baseUrl) throw new Error("OpenProject API base URL is not configured");
      if (!opts.token) throw new Error("OpenProject API token is not configured");
      const { url, init } = buildCommentRequest(opts.baseUrl, workPackageId, comment, opts.token);
      const res = await fetchImpl(url, init);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`OpenProject POST activity failed: ${res.status} ${res.statusText} ${body}`.trim());
      }
    },
  };
}
