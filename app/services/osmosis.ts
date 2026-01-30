import { OsmosisTransaction, ParsedTransaction, TransactionType } from '../types';

/**
 * Fetch transactions via Cloudflare Function (server-side proxy)
 * This avoids CORS issues by running on Cloudflare's edge network
 */
export async function fetchAllTransactions(
  address: string,
  limit: number = 100
): Promise<OsmosisTransaction[]> {
  console.log(`[fetchAllTransactions] Fetching via Cloudflare Function for: ${address}`);
  
  try {
    // Use the Cloudflare Function endpoint
    // In development, this will proxy through Next.js
    // In production on Cloudflare Pages, this runs as an edge function
    const response = await fetch(`/api/transactions?address=${encodeURIComponent(address)}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[fetchAllTransactions] Successfully fetched ${data.transactions?.length || 0} transactions`);
    return data.transactions || [];
  } catch (error) {
    console.error('[fetchAllTransactions] Error:', error);
    throw error;
  }
}

/**
 * Parse raw Osmosis transaction into simplified format for display
 */
export function parseTransaction(tx: OsmosisTransaction, walletAddress: string): ParsedTransaction {
  const messages = tx.tx?.body?.messages || [];
  const message = messages[0];
  
  let type: TransactionType = 'unknown';
  let from = '';
  let to = '';
  let amount = '';
  let currency = '';

  if (message) {
    if (message['@type']?.includes('MsgSend')) {
      type = message.from_address === walletAddress ? 'send' : 'receive';
      from = message.from_address || '';
      to = message.to_address || '';
      
      if (message.amount && message.amount.length > 0) {
        amount = formatAmount(message.amount[0].amount);
        currency = formatDenom(message.amount[0].denom);
      }
    } else if (message['@type']?.includes('MsgSwap')) {
      type = 'swap';
    } else if (message['@type']?.includes('MsgTransfer')) {
      type = 'ibc_transfer';
      from = message.sender || '';
      to = message.receiver || '';
      
      if (message.token) {
        amount = formatAmount(message.token.amount);
        currency = formatDenom(message.token.denom);
      }
    }
  }

  let fee = '';
  let feeCurrency = '';
  if (tx.tx?.auth_info?.fee?.amount && tx.tx.auth_info.fee.amount.length > 0) {
    fee = formatAmount(tx.tx.auth_info.fee.amount[0].amount);
    feeCurrency = formatDenom(tx.tx.auth_info.fee.amount[0].denom);
  }

  return {
    hash: tx.txhash,
    timestamp: new Date(tx.timestamp),
    height: parseInt(tx.height, 10),
    type,
    from,
    to,
    amount,
    currency,
    fee,
    feeCurrency,
    memo: tx.tx?.body?.memo || '',
    status: tx.code === 0 ? 'success' : 'failed',
  };
}

function formatAmount(amount: string): string {
  const num = parseInt(amount, 10);
  if (isNaN(num)) return '0';
  return (num / 1_000_000).toFixed(6);
}

function formatDenom(denom: string): string {
  if (!denom) return '';
  if (denom.startsWith('ibc/')) return 'IBC-Token';
  
  const denomMap: Record<string, string> = {
    'uosmo': 'OSMO',
    'uatom': 'ATOM',
    'uusdc': 'USDC',
    'uusd': 'UST',
    'uluna': 'LUNA',
  };
  
  return denomMap[denom] || denom.toUpperCase();
}

export function isValidOsmosisAddress(address: string): boolean {
  return /^osmo[a-z0-9]{39}$/i.test(address);
}
