import net from "node:net";

// Node's "happy eyeballs" gives each address only 250ms to connect. On hosts
// without IPv6 and with high-latency links (common in Nigeria), the IPv4
// attempt to Quidax/CoinGecko (~450ms) is abandoned too and fetch fails with
// ETIMEDOUT. One second per attempt fixes it without slowing healthy links.
net.setDefaultAutoSelectFamilyAttemptTimeout(1_000);
