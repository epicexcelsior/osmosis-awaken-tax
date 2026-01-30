import { OsmosisTransaction, ParsedTransaction, TransactionType } from '../types';

// Mintscan API Configuration - HARDCODED for testing
const MINTSCAN_API_KEY = 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM2NywiaWF0IjoxNzY5ODEzMTMzfQ.fssPTYzAgdlHGlNkypDmMVFV_dY5mHycPtt18ud0N1YakQ_F_d_2CPrS59UUZgW05sbRE-1w-I1o22qh7SKF3g';

/**
 * Fetch transactions using Mintscan API
 * API Docs: https://docs.cosmostation.io/apis/reference/historical/account/account-transactions
 */
export async function fetchTransactionsMintscan(
  address: string,
  limit: number = 100
): Promise<OsmosisTransaction[]> {
  try {
    console.log(`[Mintscan] Fetching transactions for address: ${address}`);
    
    // Correct endpoint: https://apis.mintscan.io/v1/{network}/accounts/{address}/transactions
    // Note: use 'take' parameter, not 'limit'
    const url = `https://apis.mintscan.io/v1/osmosis/accounts/${address}/transactions?take=${limit}`;
    console.log(`[Mintscan] API URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${MINTSCAN_API_KEY}`,
      },
    });

    console.log(`[Mintscan] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Mintscan] API error: ${response.status}`, errorText);
      throw new Error(`Mintscan API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Mintscan] Response data:`, data);
    
    // Parse Mintscan response format
    // The response should have a data array with transaction objects
    const transactions = data.data || [];
    console.log(`[Mintscan] Successfully fetched ${transactions.length} transactions`);
    
    // Convert Mintscan format to our OsmosisTransaction format
    return transactions.map((tx: any) => convertMintscanToOsmosisFormat(tx));
  } catch (error) {
    console.error('[Mintscan] Fetch error:', error);
    throw error;
  }
}

/**
 * Convert Mintscan transaction format to OsmosisTransaction format
 */
function convertMintscanToOsmosisFormat(mintscanTx: any): OsmosisTransaction {
  return {
    txhash: mintscanTx.tx_hash || mintscanTx.hash || '',
    height: String(mintscanTx.height || '0'),
    timestamp: mintscanTx.timestamp || new Date().toISOString(),
    code: mintscanTx.code || 0,
    tx: {
      body: {
        messages: mintscanTx.messages || [],
        memo: mintscanTx.memo || '',
      },
      auth_info: {
        fee: {
          amount: mintscanTx.fee?.amount || [],
        },
      },
    },
  };
}

/**
 * Fetch transactions from Osmosis LCD REST API (Fallback method)
 */
export async function fetchTransactionsLCD(
  address: string,
  limit: number = 100,
  offset: number = 0
): Promise<OsmosisTransaction[]> {
  const errors: string[] = [];
  const LCD_ENDPOINTS = [
    'https://lcd.osmosis.zone',
    'https://osmosis-api.polkachu.com',
    'https://api.osmosis.interbloc.org',
  ];
  
  for (const endpoint of LCD_ENDPOINTS) {
    try {
      console.log(`[LCD] Trying endpoint: ${endpoint}`);
      const txs = await fetchFromEndpoint(endpoint, address, limit, offset);
      if (txs.length > 0) {
        console.log(`[LCD] Successfully fetched ${txs.length} transactions from ${endpoint}`);
        return txs;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${endpoint}: ${errorMsg}`);
      console.warn(`[LCD] Failed:`, errorMsg);
    }
  }
  
  throw new Error(`All LCD endpoints failed. Errors: ${errors.join('; ')}`);
}

async function fetchFromEndpoint(
  endpoint: string,
  address: string,
  limit: number,
  offset: number
): Promise<OsmosisTransaction[]> {
  const [senderResponse, receiverResponse] = await Promise.allSettled([
    fetch(`${endpoint}/cosmos/tx/v1beta1/txs?events=transfer.sender='${address}'&pagination.limit=${limit}&pagination.offset=${offset}&order_by=ORDER_BY_DESC`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }),
    fetch(`${endpoint}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=${limit}&pagination.offset=${offset}&order_by=ORDER_BY_DESC`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }),
  ]);

  let senderTxs: OsmosisTransaction[] = [];
  let receiverTxs: OsmosisTransaction[] = [];

  if (senderResponse.status === 'fulfilled' && senderResponse.value.ok) {
    const data = await senderResponse.value.json();
    senderTxs = data.tx_responses || [];
  }

  if (receiverResponse.status === 'fulfilled' && receiverResponse.value.ok) {
    const data = await receiverResponse.value.json();
    receiverTxs = data.tx_responses || [];
  }

  const allTxs = [...senderTxs, ...receiverTxs];
  const uniqueTxs = Array.from(new Map(allTxs.map((tx: OsmosisTransaction) => [tx.txhash, tx])).values());
  uniqueTxs.sort((a: OsmosisTransaction, b: OsmosisTransaction) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return uniqueTxs.slice(0, limit);
}

/**
 * Main transaction fetcher with fallback
 */
export async function fetchAllTransactions(
  address: string,
  limit: number = 100
): Promise<OsmosisTransaction[]> {
  console.log(`[fetchAllTransactions] Starting fetch for: ${address}`);
  
  // Try Mintscan first
  try {
    console.log('[fetchAllTransactions] Trying Mintscan API...');
    const mintscanTxs = await fetchTransactionsMintscan(address, limit);
    if (mintscanTxs.length > 0) {
      console.log(`[fetchAllTransactions] Mintscan success: ${mintscanTxs.length} txs`);
      return mintscanTxs;
    }
  } catch (error) {
    console.warn('[fetchAllTransactions] Mintscan failed:', error);
  }
  
  // Fallback to LCD
  try {
    console.log('[fetchAllTransactions] Trying LCD endpoints...');
    const lcdTxs = await fetchTransactionsLCD(address, limit);
    if (lcdTxs.length > 0) {
      console.log(`[fetchAllTransactions] LCD success: ${lcdTxs.length} txs`);
      return lcdTxs;
    }
  } catch (error) {
    console.error('[fetchAllTransactions] LCD failed:', error);
    throw new Error('Failed to fetch transactions from all sources');
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
