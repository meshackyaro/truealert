// Stub for the optional `@x402/*` peers of `@coinbase/cdp-sdk`, which wagmi's
// Base Account connector pulls in. TrueAlert never uses x402 payments or the
// Base Account connector; this only lets Turbopack resolve the imports.
// Any real use throws loudly instead of failing silently.
const fail = (name) =>
  function x402Stub() {
    throw new Error(`@x402 is not bundled in TrueAlert (tried to use ${String(name)})`);
  };
module.exports = new Proxy({}, { get: (_target, name) => (name === "__esModule" ? false : fail(name)) });
