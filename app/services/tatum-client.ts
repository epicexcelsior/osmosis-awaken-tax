import {
  ChainTransaction,
  ParsedTransaction,
  TransactionType,
  ChainId,
} from "../types";
import { getChainConfig } from "../config/chains";

/**
 * Tatum API client for EVM chains (Celo, Fantom)
 * This provides indexed transaction history - works reliably unlike LCD endpoints
 */

const TATUM_API_KEY = "t-697d4031ace70350f2245030-4a6be09c40b84989bb00c1c8";

interface TatumTransaction {
  chain: string;
  hash: string;
  address: string;
  blockNumber: number;
  transactionIndex: number;
  transactionType: string;
  transactionSubtype: string;
  amount: string;
  timestamp: number;
  tokenAddress?: string;
  counterAddress?: string;
}

/**
 * Fetch ALL transactions from Tatum for EVM chains
 */
export async function fetchAllTransactionsClientSide(
  chainId: ChainId,
  address: string,
  onProgress?: (count: number) => void,
): Promise<{ transactions: ChainTransaction[]; metadata: any }> {
  console.log(`[Tatum ${chainId}] Starting fetch for ${address}`);

  const chainMap: Record<string, string> = {
    celo: "celo-mainnet",
    fantom: "fantom-mainnet",
  };

  const tatumChain = chainMap[chainId];
  if (!tatumChain) {
    throw new Error(`Chain ${chainId} not supported by Tatum`);
  }

  const allTransactions: ChainTransaction[] = [];
  let offset = 0;
  const pageSize = 50;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `https://api.tatum.io/v4/data/transactions?chain=${tatumChain}&addresses=${address}&pageSize=${pageSize}&offset=${offset}`;

      const response = await fetch(url, {
        headers: {
          "x-api-key": TATUM_API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Tatum ${chainId}] Error:`, errorText);
        break;
      }

      const data = await response.json();
      const txs: TatumTransaction[] = data.result || [];

      if (txs.length === 0) {
        hasMore = false;
        break;
      }

      // Convert to ChainTransaction format
      for (const tx of txs) {
        const converted: ChainTransaction = {
          hash: tx.hash,
          height: String(tx.blockNumber),
          timestamp: new Date(tx.timestamp * 1000).toISOString(),
          code: 0,
          chain: chainId,
          tx: {
            body: {
              messages: [
                {
                  "@type": `/cosmos.bank.v1beta1.Msg${tx.transactionSubtype === "incoming" ? "Receive" : "Send"}`,
                  from_address:
                    tx.transactionSubtype === "incoming"
                      ? tx.counterAddress || ""
                      : address,
                  to_address:
                    tx.transactionSubtype === "incoming"
                      ? address
                      : tx.counterAddress || "",
                  amount: [
                    {
                      amount: tx.amount,
                      denom: tx.tokenAddress || "native",
                    },
                  ],
                },
              ],
              memo: "",
            },
            auth_info: { fee: { amount: [] } },
          },
        };
        allTransactions.push(converted);
      }

      if (onProgress) {
        onProgress(allTransactions.length);
      }

      console.log(
        `[Tatum ${chainId}] Fetched ${allTransactions.length} transactions...`,
      );

      hasMore = txs.length === pageSize;
      offset += pageSize;

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[Tatum ${chainId}] Fetch error:`, error);
      break;
    }
  }

  // Sort by timestamp (newest first)
  allTransactions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const dates = allTransactions.map((tx) => new Date(tx.timestamp));
  const firstDate =
    dates.length > 0
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : null;
  const lastDate =
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;

  console.log(
    `[Tatum ${chainId}] FINAL: ${allTransactions.length} transactions`,
  );

  return {
    transactions: allTransactions,
    metadata: {
      address,
      chain: chainId,
      totalFetched: allTransactions.length,
      firstTransactionDate: firstDate?.toISOString(),
      lastTransactionDate: lastDate?.toISOString(),
      dataSource: "Tatum API v4",
    },
  };
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function parseTransaction(
  tx: ChainTransaction,
  walletAddress: string,
): ParsedTransaction {
  const messages = tx.tx?.body?.messages || [];
  const message = messages[0];

  let type: TransactionType = "unknown";
  let from = "";
  let to = "";
  let amount = "";
  let currency = "";

  if (message) {
    const msgType = message["@type"] || "";

    if (msgType.includes("Receive")) {
      type = "receive";
      from = message.from_address || "";
      to = message.to_address || walletAddress;
    } else if (msgType.includes("Send")) {
      type = "send";
      from = message.from_address || walletAddress;
      to = message.to_address || "";
    }

    if (message.amount) {
      const amountArr = Array.isArray(message.amount)
        ? message.amount
        : [message.amount];
      if (amountArr.length > 0) {
        // Convert from wei for EVM chains
        const rawAmount = amountArr[0].amount;
        const denom = amountArr[0].denom;

        if (denom === "native" || denom === "") {
          // Native token - divide by 10^18
          const num = parseFloat(rawAmount) / 1e18;
          amount = num.toFixed(6);
          currency =
            tx.chain === "celo"
              ? "CELO"
              : tx.chain === "fantom"
                ? "FTM"
                : "ETH";
        } else {
          // Token - might be different decimals
          amount = rawAmount;
          currency = "TOKEN";
        }
      }
    }
  }

  return {
    hash: tx.hash,
    timestamp: new Date(tx.timestamp),
    height: parseInt(tx.height, 10) || 0,
    type,
    from,
    to,
    amount,
    currency,
    fee: "",
    feeCurrency: "",
    memo: tx.tx?.body?.memo || "",
    status: "success",
    chain: tx.chain,
  };
}
