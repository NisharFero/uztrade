import { get, put } from "@vercel/blob";
import type { DocsBucket } from "./ingest";

export type DocumentBucket = DocsBucket & {
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
};

const vercelBucket: DocumentBucket = {
  async put(key, value, options) {
    await put(key, value, {
      access: "private",
      addRandomSuffix: false,
      contentType: options?.httpMetadata?.contentType,
    });
  },
  async get(key) {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, httpMetadata: { contentType: result.blob.contentType } };
  },
};

export function documentBucket(env: { DOCS?: DocsBucket }): DocsBucket | null {
  if (env.DOCS) return env.DOCS;
  if (process.env.BLOB_READ_WRITE_TOKEN) return vercelBucket;
  if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is required for document storage");
  return null;
}
