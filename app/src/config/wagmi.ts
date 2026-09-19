import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { env } from "./env";

const appName = "TrueAlert";

// MetaMask/Trust/WalletConnect need a WalletConnect Cloud project ID. Without
// one we still support injected wallets — which covers MetaMask's and other
// wallets' in-app browsers, the main mobile path for the demo.
const walletGroups = env.walletConnectProjectId
  ? [
      {
        groupName: "Recommended",
        wallets: [metaMaskWallet, rabbyWallet, trustWallet, walletConnectWallet, injectedWallet],
      },
    ]
  : [{ groupName: "Browser wallet", wallets: [injectedWallet] }];

const connectors = connectorsForWallets(walletGroups, {
  appName,
  projectId: env.walletConnectProjectId ?? "unused-without-walletconnect",
});

export const wagmiConfig = createConfig({
  chains: [env.chain],
  connectors,
  transports: { [env.chain.id]: http(env.rpcUrl) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
