import type { Page } from "playwright";

/**
 * Injects a minimal EIP-1193 wallet into the page that forwards every request
 * to a local anvil node. Anvil's default accounts are unlocked, so
 * eth_sendTransaction is signed by the node itself — real transactions, no
 * extension needed. Test-only: never point this at a real network.
 *
 * The script is a plain string (not a serialized function) because tsx/esbuild
 * inject helpers like `__name` into functions, which don't exist in the page.
 */
export async function injectTestWallet(page: Page, opts: { account: string; rpcUrl: string; chainId: number }) {
  const config = JSON.stringify(opts);
  await page.addInitScript(`(() => {
    const { account, rpcUrl, chainId } = ${config};
    let id = 0;
    let approved = false; // like real wallets: no accounts until the user approves
    const listeners = {};
    async function rpc(method, params) {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params || [] }),
      });
      const json = await res.json();
      if (json.error) {
        const err = new Error(json.error.message);
        err.code = json.error.code;
        err.data = json.error.data;
        throw err;
      }
      return json.result;
    }
    const provider = {
      isTestWallet: true,
      async request({ method, params }) {
        switch (method) {
          case "eth_requestAccounts":
            approved = true;
            return [account];
          case "eth_accounts":
            return approved ? [account] : [];
          case "eth_chainId":
            return "0x" + chainId.toString(16);
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            return null;
          case "wallet_requestPermissions":
          case "wallet_getPermissions":
            return [{ parentCapability: "eth_accounts" }];
          default:
            return rpc(method, params);
        }
      },
      on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
      removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  })();`);
}
