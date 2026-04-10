/**
 * Standalone Docmost HTTP/WebSocket client.
 * Extracted from docmost-mcp — no MCP dependencies.
 */
import FormData from "form-data";
import axios, { AxiosInstance } from "axios";
import { performLogin, getCollabToken } from "./auth.js";
import { updatePageContentRealtime } from "./docmost-updater.js";
import { markdownToTiptapJson } from "./markdown-to-json.js";

export class DocmostClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async login(email: string, password: string): Promise<void> {
    this.token = await performLogin(this.baseURL, email, password);
    this.client.defaults.headers.common["Authorization"] =
      `Bearer ${this.token}`;
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      throw new Error(
        "Not authenticated. Call login(email, password) first.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  /**
   * Generic pagination handler for Docmost API endpoints.
   * @param endpoint - The API endpoint path (e.g., "/spaces", "/pages/recent")
   * @param basePayload - Base payload object to send with each request
   * @param limit - Items per page (min: 1, max: 100, default: 100)
   * @returns All items collected from all pages
   */
  async paginateAll<T = any>(
    endpoint: string,
    basePayload: Record<string, any> = {},
    limit: number = 100,
  ): Promise<T[]> {
    await this.ensureAuthenticated();

    const clampedLimit = Math.max(1, Math.min(100, limit));

    let page = 1;
    let allItems: T[] = [];
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await this.client.post(endpoint, {
        ...basePayload,
        limit: clampedLimit,
        page,
      });

      const data = response.data;

      // Handle both direct data.items and data.data.items structures
      const items = data.data?.items || data.items || [];
      const meta = data.data?.meta || data.meta;

      allItems = allItems.concat(items);
      hasNextPage = meta?.hasNextPage || false;
      page++;
    }

    return allItems;
  }

  // ---------------------------------------------------------------------------
  // Workspace / Spaces / Groups
  // ---------------------------------------------------------------------------

  async getWorkspace(): Promise<any> {
    await this.ensureAuthenticated();
    const response = await this.client.post("/workspace/info", {});
    return response.data;
  }

  async getSpaces(): Promise<any[]> {
    return this.paginateAll("/spaces", {});
  }

  async getGroups(): Promise<any[]> {
    return this.paginateAll("/groups", {});
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  async listPages(spaceId?: string): Promise<any[]> {
    const payload = spaceId ? { spaceId } : {};
    return this.paginateAll("/pages/recent", payload);
  }

  async listSidebarPages(spaceId: string, pageId: string): Promise<any[]> {
    await this.ensureAuthenticated();
    const response = await this.client.post("/pages/sidebar-pages", {
      spaceId,
      pageId,
      page: 1,
    });
    return response.data?.data?.items || [];
  }

  async getPage(pageId: string): Promise<any> {
    await this.ensureAuthenticated();
    const response = await this.client.post("/pages/info", { pageId });
    return response.data.data || response.data;
  }

  /**
   * Create a new page with title and content.
   *
   * Uses /pages/import (multipart/form-data) to create a page with initial
   * content, then moves it to the correct parent if specified.
   */
  async createPage(
    title: string,
    content: string,
    spaceId: string,
    parentPageId?: string,
  ): Promise<any> {
    await this.ensureAuthenticated();

    if (parentPageId) {
      try {
        await this.getPage(parentPageId);
      } catch (e) {
        throw new Error(`Parent page with ID ${parentPageId} not found.`);
      }
    }

    // 1. Create content via Import (using multipart/form-data)
    const form = new FormData();
    form.append("spaceId", spaceId);

    const fileContent = Buffer.from(content, "utf-8");
    form.append("file", fileContent, {
      filename: `${title || "import"}.md`,
      contentType: "text/markdown",
    });

    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${this.token}`,
    };

    const response = await axios.post(`${this.baseURL}/pages/import`, form, {
      headers,
    });
    const newPageId = response.data.data.id;

    // 2. Move to parent if needed
    if (parentPageId) {
      await this.movePage(newPageId, parentPageId);
    }

    // Return the final page object
    return this.getPage(newPageId);
  }

  /**
   * Update a page's content and optionally its title.
   * Leverages WebSocket collaboration to update content without changing Page ID.
   */
  async updatePage(
    pageId: string,
    content: string,
    title?: string,
  ): Promise<{ success: boolean; modified: boolean; message: string; pageId: string }> {
    await this.ensureAuthenticated();

    // 1. Update Title via REST API if provided
    if (title) {
      await this.updatePageTitle(pageId, title);
    }

    // 2. Update Content via WebSocket
    let collabToken = "";
    try {
      collabToken = await getCollabToken(this.baseURL, this.token!);
      await updatePageContentRealtime(pageId, content, collabToken, this.baseURL);
    } catch (error: any) {
      console.error(
        "Failed to update page content via realtime collaboration:",
        error,
      );
      const tokenPreview = collabToken
        ? collabToken.substring(0, 15) + "..."
        : "null";
      throw new Error(
        `Failed to update page content: ${error.message} (Token: ${tokenPreview})`,
      );
    }

    return {
      success: true,
      modified: true,
      message: "Page updated successfully.",
      pageId,
    };
  }

  /**
   * Update only the page title (no content change).
   */
  async updatePageTitle(pageId: string, title: string): Promise<any> {
    await this.ensureAuthenticated();
    const response = await this.client.post("/pages/update", { pageId, title });
    return response.data;
  }

  async movePage(
    pageId: string,
    parentPageId: string | null,
    position?: string,
  ): Promise<any> {
    await this.ensureAuthenticated();
    // Docmost requires position >= 5 chars
    const validPosition = position || "a00000";

    return this.client
      .post("/pages/move", {
        pageId,
        parentPageId,
        position: validPosition,
      })
      .then((res) => res.data);
  }

  async deletePage(pageId: string): Promise<any> {
    await this.ensureAuthenticated();
    return this.client
      .post("/pages/delete", { pageId })
      .then((res) => res.data);
  }

  async deletePages(
    pageIds: string[],
  ): Promise<Array<{ id: string; success: boolean; error?: string }>> {
    await this.ensureAuthenticated();
    const promises = pageIds.map((id) =>
      this.client
        .post("/pages/delete", { pageId: id })
        .then(() => ({ id, success: true }))
        .catch((err: any) => ({ id, success: false, error: err.message })),
    );
    return Promise.all(promises);
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async search(query: string, spaceId?: string): Promise<any> {
    await this.ensureAuthenticated();
    const response = await this.client.post("/search", { query, spaceId });
    return {
      items: response.data?.data || [],
      success: response.data?.success || false,
    };
  }

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------

  async listComments(pageId: string): Promise<any[]> {
    await this.ensureAuthenticated();
    let allComments: any[] = [];
    let cursor: string | null = null;

    do {
      const payload: Record<string, any> = { pageId, limit: 100 };
      if (cursor) payload.cursor = cursor;

      const response = await this.client.post("/comments", payload);
      const data = response.data.data || response.data;
      const items = data.items || [];
      allComments = allComments.concat(items);
      cursor = data.meta?.nextCursor || null;
    } while (cursor);

    return allComments;
  }

  async getComment(commentId: string): Promise<any> {
    await this.ensureAuthenticated();
    const response = await this.client.post("/comments/info", { commentId });
    return response.data.data || response.data;
  }

  async createComment(
    pageId: string,
    content: string,
    type: "page" | "inline" = "page",
    selection?: string,
    parentCommentId?: string,
  ): Promise<any> {
    await this.ensureAuthenticated();
    const jsonContent = await markdownToTiptapJson(content);
    const payload: Record<string, any> = {
      pageId,
      content: JSON.stringify(jsonContent),
      type,
    };
    if (selection) payload.selection = selection;
    if (parentCommentId) payload.parentCommentId = parentCommentId;

    const response = await this.client.post("/comments/create", payload);
    return response.data.data || response.data;
  }

  async updateComment(commentId: string, content: string): Promise<any> {
    await this.ensureAuthenticated();
    const jsonContent = await markdownToTiptapJson(content);
    const response = await this.client.post("/comments/update", {
      commentId,
      content: JSON.stringify(jsonContent),
    });
    return {
      success: true,
      commentId,
      message: "Comment updated successfully.",
    };
  }

  async deleteComment(commentId: string): Promise<any> {
    await this.ensureAuthenticated();
    return this.client
      .post("/comments/delete", { commentId })
      .then((res) => res.data);
  }

  /**
   * Check for new comments across pages in a space (optionally scoped to a subtree).
   */
  async checkNewComments(
    spaceId: string,
    since: string,
    parentPageId?: string,
  ): Promise<any> {
    await this.ensureAuthenticated();

    const sinceDate = new Date(since);

    // 1. Get all pages in the space
    const allPages = await this.paginateAll<any>("/pages/recent", { spaceId });

    // 2. If parentPageId specified, build set of descendant page IDs
    let allowedPageIds: Set<string> | null = null;
    if (parentPageId) {
      allowedPageIds = new Set<string>();
      const pageMap = new Map<string, any[]>();
      for (const page of allPages) {
        const pid = page.parentPageId || "__root__";
        if (!pageMap.has(pid)) pageMap.set(pid, []);
        pageMap.get(pid)!.push(page);
      }
      const queue = [parentPageId];
      allowedPageIds.add(parentPageId);
      while (queue.length > 0) {
        const current = queue.shift()!;
        const children = pageMap.get(current) || [];
        for (const child of children) {
          allowedPageIds.add(child.id);
          queue.push(child.id);
        }
      }
    }

    // 3. Filter pages by updatedAt > since and optional subtree
    const recentlyUpdated = allPages.filter((page: any) => {
      if (new Date(page.updatedAt) <= sinceDate) return false;
      if (allowedPageIds && !allowedPageIds.has(page.id)) return false;
      return true;
    });

    // 4. Fetch comments for each updated page and filter by createdAt > since
    const results: any[] = [];
    for (const page of recentlyUpdated) {
      try {
        const comments = await this.listComments(page.id);
        const newComments = comments.filter(
          (c: any) => new Date(c.createdAt) > sinceDate,
        );
        if (newComments.length > 0) {
          results.push({
            pageId: page.id,
            pageTitle: page.title,
            comments: newComments,
          });
        }
      } catch (e: any) {
        // Skip pages with errors
      }
    }

    const totalNewComments = results.reduce(
      (sum, r) => sum + r.comments.length,
      0,
    );

    return {
      since,
      scope: parentPageId
        ? `subtree of ${parentPageId}`
        : `space ${spaceId}`,
      checkedPages: recentlyUpdated.length,
      pagesWithNewComments: results.length,
      totalNewComments,
      comments: results,
    };
  }
}
