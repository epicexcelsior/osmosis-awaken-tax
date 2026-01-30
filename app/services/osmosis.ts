import { OsmosisTransaction, ParsedTransaction, TransactionType } from '../types';

// Mintscan API Configuration
const MINTSCAN_API_KEY = process.env.NEXT_PUBLIC_MINTSCAN_API_KEY || '';

// Fallback LCD endpoints if Mintscan fails
const LCD_ENDPOINTS = [
  'https://lcd.osmosis.zone',
  'https://osmosis-api.polkachu.com',
  'https://api.osmosis.interbloc.org',
];

/**
 * Fetch transactions using Mintscan API (Primary method)
 * This is the most reliable method with proper CORS support
 */
export async function fetchTransactionsMintscan(
  address: string,
  limit: number = 100,
  offset: number = 0
): Promise<OsmosisTransaction[]> {
  if (!MINTSCAN_API_KEY) {
    console.warn('Mintscan API key not configured. Set NEXT_PUBLIC_MINTSCAN_API_KEY environment variable.');
    throw new Error('Mintscan API key required');
  }

  try {
    console.log(`Fetching transactions from Mintscan API for address: ${address}`);
    
    const response = await fetch(
      `https://api.mintscan.io/v1/osmosis/accounts/${address}/transactions?limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${MINTSCAN_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Mintscan API error: ${response.status}`, errorText);
      throw new Error(`Mintscan API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Successfully fetched ${data.data?.length || 0} transactions from Mintscan`);
    return data.data || [];
  } catch (error) {
    console.error('Mintscan fetch error:', error);
    throw error;
  }
}

/**
 * Fetch transactions from Osmosis LCD REST API (Fallback method)
 * Tries multiple endpoints to find one that works with CORS
 */
export async function fetchTransactionsLCD(
  address: string,
  limit: number = 100,
  offset: number = 0
): Promise<OsmosisTransaction[]> {
  const errors: string[] = [];
  
  // Try each endpoint
  for (const endpoint of LCD_ENDPOINTS) {
    try {
      const txs = await fetchFromEndpoint(endpoint, address, limit, offset);
      if (txs.length > 0) {
        console.log(`Successfully fetched ${txs.length} transactions from ${endpoint}`);
        return txs;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${endpoint}: ${errorMsg}`);
      console.warn(`Failed to fetch from ${endpoint}:`, errorMsg);
    }
  }
  
  // If all endpoints failed, throw error with details
  throw new Error(`All LCD endpoints failed. Errors: ${errors.join('; ')}`);
}

async function fetchFromEndpoint(
  endpoint: string,
  address: string,
  limit: number,
  offset: number
): Promise<OsmosisTransaction[]> {
  // Query transactions where address is sender OR receiver
  const [senderResponse, receiverResponse] = await Promise.allSettled([
    fetch(`${endpoint}/cosmos/tx/v1beta1/txs?events=transfer.sender='${address}'&pagination.limit=${limit}&pagination.offset=${offset}&order_by=ORDER_BY_DESC`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }),
    fetch(`${endpoint}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=${limit}&pagination.offset=${offset}&order_by=ORDER_BY_DESC`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }),
  ]);

  let senderTxs: OsmosisTransaction[] = [];
  let receiverTxs: OsmosisTransaction[] = [];

  if (senderResponse.status === 'fulfilled') {
    if (senderResponse.value.ok) {
      const data = await senderResponse.value.json();
      senderTxs = data.tx_responses || [];
    } else if (senderResponse.value.status === 500) {
      throw new Error(`Server error (500) from ${endpoint}`);
    }
  } else {
    throw senderResponse.reason;
  }

  if (receiverResponse.status === 'fulfilled') {
    if (receiverResponse.value.ok) {
      const data = await receiverResponse.value.json();
      receiverTxs = data.tx_responses || [];
    }
  }

  // Combine and deduplicate transactions
  const allTxs = [...senderTxs, ...receiverTxs];
  const uniqueTxs = Array.from(new Map(allTxs.map((tx: OsmosisTransaction) => [tx.txhash, tx])).values());

  // Sort by timestamp descending
  uniqueTxs.sort((a: OsmosisTransaction, b: OsmosisTransaction) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return uniqueTxs.slice(0, limit);
}

/**
 * Main transaction fetcher with fallback
 * Tries Mintscan first (most reliable), then falls back to LCD endpoints
 */
export async function fetchAllTransactions(
  address: string,
  limit: number = 100
): Promise<OsmosisTransaction[]> {
  // Try Mintscan first if API key is available
  if (MINTSCAN_API_KEY) {
    try {
      console.log('Attempting to fetch from Mintscan API...');
      const mintscanTxs = await fetchTransactionsMintscan(address, limit);
      if (mintscanTxs.length > 0) {
        console.log(`Successfully fetched ${mintscanTxs.length} transactions from Mintscan`);
        return mintscanTxs;
      }
    } catch (error) {
      console.warn('Mintscan API failed, falling back to LCD endpoints:', error);
    }
  }
  
  // Fallback to LCD endpoints
  try {
    console.log('Attempting to fetch from LCD endpoints...');
    const lcdTxs = await fetchTransactionsLCD(address, limit);
    if (lcdTxs.length > 0) {
      console.log(`Successfully fetched ${lcdTxs.length} transactions from LCD endpoint`);
      return lcdTxs;
    }
  } catch (error) {
    console.error('LCD endpoints also failed:', error);
    throw error;
  }
  
  return [];
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
    // Determine transaction type and extract details
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
      // Extract swap details from events if available
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

  // Extract fee
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

/**
 * Format amount from micro units to readable format
 */
function formatAmount(amount: string): string {
  const num = parseInt(amount, 10);
  if (isNaN(num)) return '0';
  
  // Convert from micro (6 decimals) to standard units
  return (num / 1_000_000).toFixed(6);
}

/**
 * Format denomination from blockchain format to readable
 */
function formatDenom(denom: string): string {
  if (!denom) return '';
  
  // Handle IBC tokens
  if (denom.startsWith('ibc/')) {
    return 'IBC-Token';
  }
  
  // Handle standard denominations
  const denomMap: Record<string, string> = {
    'uosmo': 'OSMO',
    'uatom': 'ATOM',
    'uusdc': 'USDC',
    'uusd': 'UST',
    'uluna': 'LUNA',
  };
  
  return denomMap[denom] || denom.toUpperCase();
}

/**
 * Validate Osmosis wallet address
 */
export function isValidOsmosisAddress(address: string): boolean {
  // Osmosis addresses start with 'osmo' followed by alphanumeric characters
  return /^osmo[a-z0-9]{39}$/i.test(address);
}
