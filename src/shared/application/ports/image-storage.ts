export interface ImageStorage {
  /**
   * Fetches the image at `sourceUrl` and stores it under our own hosting,
   * returning a stable URL we control instead of a hotlink to third-party
   * infrastructure. Returns `null` on any failure (network error, non-2xx,
   * unrecognized/non-image content type, oversized file) — callers should
   * treat that as "no image available" rather than fail the caller's
   * larger operation.
   */
  store(sourceUrl: string): Promise<string | null>;

  /**
   * Persists image bytes we already have in hand (e.g. a file uploaded
   * through the admin UI) under our own hosting. Same validation rules as
   * `store` (recognized image content type, size cap), just skipping the
   * network fetch. Returns `null` on invalid content type or oversized input.
   */
  storeUploadedFile(buffer: Buffer, contentType: string): Promise<string | null>;
}
