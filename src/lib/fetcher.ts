import type { Monitor } from '@/db';

export interface CheckResult {
  success: boolean;
  content?: string;
  statusCode?: number;
  error?: string;
  contentType?: string;
}

export class Fetcher {
  private static MAX_BYTES = 5 * 1024 * 1024;
  private static USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ];

  private rateLimits = new Map<string, number[]>();

  async check(monitor: Monitor): Promise<CheckResult> {
    const headers = this.buildHeaders();

    try {
      // Check rate limiting
      await this.checkRateLimit(new URL(monitor.url).hostname);

      // Fetch with retry logic
      const response = await this.fetchWithRetry(monitor.url, { headers }, 2);

      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // Get raw content with size limit
      const rawText = await this.readTextWithLimit(response, Fetcher.MAX_BYTES);
      const contentType = response.headers.get('content-type') || '';
      const content = await this.processContent(rawText, monitor, contentType);

      return {
        success: true,
        content,
        statusCode: response.status,
        contentType: contentType || undefined,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private buildHeaders(): Record<string, string> {
    const randomUserAgent = Fetcher.USER_AGENTS[
      Math.floor(Math.random() * Fetcher.USER_AGENTS.length)
    ];

    return {
      'User-Agent': randomUserAgent,
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
  }

  private async checkRateLimit(domain: string): Promise<void> {
    const now = Date.now();
    const recentRequests = this.rateLimits.get(domain) || [];

    // Filter requests within the last second
    const requestsInLastSecond = recentRequests.filter((t) => t > now - 1000);

    // Check if we're at the rate limit (2 requests per second)
    if (requestsInLastSecond.length >= 2) {
      // Add jitter to avoid thundering herd
      const waitTime = 1000 + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Add current request timestamp
    requestsInLastSecond.push(now);
    this.rateLimits.set(domain, requestsInLastSecond);

    // Clean up old entries periodically
    if (this.rateLimits.size > 1000) {
      for (const [key, timestamps] of this.rateLimits.entries()) {
        if (timestamps.every((t) => t < now - 60000)) {
          this.rateLimits.delete(key);
        }
      }
    }
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add exponential backoff with jitter for retries
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          const jitter = Math.random() * delay * 0.3;
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }

        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30000),
        });

        // If we get rate limited, wait and retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const waitTime = parseInt(retryAfter) * 1000;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          }
        }

        // For server errors, retry
        if (response.status >= 500 && attempt < maxRetries) {
          continue;
        }

        return response;
      } catch (error: unknown) {
        lastError = error as Error;
        if (attempt === maxRetries) {
          throw (error as Error);
        }
      }
    }

    throw lastError || new Error('Failed to fetch after retries');
  }

  private async processContent(
    rawText: string,
    monitor: Monitor,
    contentType: string
  ): Promise<string> {
    if (monitor.type === 'api' || contentType.includes('application/json')) {
      try {
        const json = JSON.parse(rawText);
        return JSON.stringify(json, null, 2);
      } catch {
        throw new Error('Invalid JSON response');
      }
    }

    // XML support: pretty-print XML content or when monitor.type is xml
    if (monitor.type === 'xml' || contentType.includes('application/xml') || contentType.includes('text/xml')) {
      try {
        // Basic XML pretty print without external deps
        const formatted = this.prettyPrintXml(rawText);
        return formatted;
      } catch {
        return rawText;
      }
    }

    // For all other types, return as text
    return rawText;
  }

  // Minimal XML pretty-printer (indentation only)
  private prettyPrintXml(xml: string): string {
    // Remove insignificant whitespace between tags
    const cleaned = xml.replace(/>\s+</g, '><').trim();
    const tokens = cleaned.replace(/></g, '>~<').split('~');
    let indent = 0;
    const out: string[] = [];
    for (const t of tokens) {
      if (t.match(/^<\//)) {
        indent = Math.max(indent - 1, 0);
      }
      out.push('  '.repeat(indent) + t);
      if (t.match(/^<[^!?][^>]*[^\/]>/)) {
        indent++;
      }
    }
    return out.join('\n');
  }

  private async readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader) {
      const length = Number(lengthHeader);
      if (Number.isFinite(length) && length > maxBytes) {
        throw new Error('Response too large (max 5 MB)');
      }
    }

    if (!response.body) {
      const text = await response.text();
      const size = new TextEncoder().encode(text).byteLength;
      if (size > maxBytes) {
        throw new Error('Response too large (max 5 MB)');
      }
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    const chunks: string[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          throw new Error('Response too large (max 5 MB)');
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  }

}
