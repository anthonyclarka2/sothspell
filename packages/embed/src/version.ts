/**
 * The embed API version is the contract a host page codes against: methods,
 * events, and the `postMessage` channel. It is independent of the tour schema
 * version, which the controller checks at load time.
 */
export const EMBED_API_VERSION = '1.0.0' as const;
