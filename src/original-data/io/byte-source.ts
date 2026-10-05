// Byte reading port (P2-02 S-07). Type-only and import-free: platform and tool adapters implement it, and the disc reader
// never trusts what an implementation returns.

/** Random-access bytes of one host file, such as a browser `File` or a read-only Node file handle. */
export interface ByteSource {
  /** Size in bytes, a nonnegative safe integer. The bytes must not change while the source is in use. */
  readonly byteLength: number;
  /**
   * Resolves to exactly `length` bytes starting at `offset`. Callers pass safe integers with `offset >= 0`,
   * `length >= 1` and `offset <= byteLength - length`.
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}
