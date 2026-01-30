import { OsmosisTransaction, ParsedTransaction, TransactionType } from '../types';

// Public LCD endpoints that support CORS
const LCD_ENDPOINTS = [
  'https://lcd.osmosis.zone',
  'https://osmosis-api.polkachu.com',
  'https://rest-osmosis.blockapsis.com',
  'https://osmosis-rest.publicnode.com',
];

// RPC endpoints for tx_search
const RPC_ENDPOINTS = [
  'https://rpc.osmosis.zone',
  'https://osmosis-rpc.polkachu.com',
];

/**
 * Client-side transaction fetcher
 * Runs entirely in browser - no server needed!
 */
export async function fetchAllTransactionsClientSide(
  address: string,
  onProgress?: (count: number, total: number) => void
): Promise<{ transactions: OsmosisTransaction[]; metadata: any }> {
  console.log(`[Client] Fetching transactions for ${address}`);
  
  const allTransactions = new Map<string, OsmosisTransaction>();
  const queryResults: any[] = [];
  let totalReported = 0;
  
  // Comprehensive query types
  const queryTypes = [
    { name: 'message.sender', query: `message.sender='${address}'` },
    { name: 'transfer.recipient', query: `transfer.recipient='${address}'` },
    { name: 'transfer.sender', query: `transfer.sender='${address}'` },
    { name: 'ibc_transfer.sender', query: `ibc_transfer.sender='${address}'` },
    { name: 'ibc_transfer.receiver', query: `ibc_transfer.receiver='${address}'` },
    { name: 'delegate.delegator', query: `delegate.delegator_address='${address}'` },
    { name: 'begin_redelegate', query: `begin_redelegate.delegator_address='${address}'` },
    { name: 'begin_unbonding', query: `begin_unbonding.delegator_address='${address}'` },
    { name: 'withdraw_rewards', query: `withdraw_rewards.delegator_address='${address}'` },
    { name: 'swap_exact_amount_in', query: `swap_exact_amount_in.sender='${address}'` },
    { name: 'join_pool', query: `join_pool.sender='${address}'` },
    { name: 'exit_pool', query: `exit_pool.sender='${address}'` },
    { name: 'lock_tokens', query: `lock_tokens.owner='${address}'` },
    { name: 'begin_unlocking', query: `begin_unlocking.owner='${address}'` },
    { name: 'vote', query: `vote.voter='${address}'` },
    { name: 'submit_proposal', query: `submit_proposal.proposer='${address}'` },
    { name: 'send', query: `send.from_address='${address}'` },
    { name: 'create_denom', query: `create_denom.sender='${address}'` },
    { name: 'mint', query: `mint.sender='${address}'` },
    { name: 'burn', query: `burn.sender='${address}'` },
  ];
  
  // Try each endpoint
  for (const endpoint of LCD_ENDPOINTS) {
    console.log(`[Client] Trying LCD: ${endpoint}`);
    let endpointSuccess = false;
    
    for (const queryType of queryTypes) {
      try {
        const result = await fetchWithPaginationClientSide(
          endpoint, 
          queryType.query,
          (count) => {
            if (onProgress) {
              onProgress(allTransactions.size, totalReported);
            }
          }
        );
        
        // Add to collection
        result.transactions.forEach((tx: OsmosisTransaction) => {
          allTransactions.set(tx.txhash, tx);
        });
        
        totalReported += parseInt(result.total || '0', 10);
        
        queryResults.push({
          query: queryType.name,
          count: result.transactions.length,
          total: result.total,
          endpoint: endpoint,
        });
        
        if (result.transactions.length > 0) {
          console.log(`[Client] ${queryType.name}: ${result.transactions.length} txs`);
          endpointSuccess = true;
        }
      } catch (error) {
        console.log(`[Client] ${queryType.name} failed on ${endpoint}:`, error);
        queryResults.push({
          query: queryType.name,
          count: 0,
          error: 'Failed',
          endpoint: endpoint,
        });
      }
    }
    
    if (endpointSuccess && allTransactions.size > 50) {
      console.log(`[Client] Good data from ${endpoint}, stopping`);
      break;
    }
  }
  
  // Also try RPC for additional data
  if (allTransactions.size < 100) {
    console.log(`[Client] Trying RPC endpoints...`);
    
    for (const rpcEndpoint of RPC_ENDPOINTS) {
      try {
        const rpcTxs = await fetchFromRPCClientSide(rpcEndpoint, address);
        
        rpcTxs.forEach((tx: OsmosisTransaction) => {
          allTransactions.set(tx.txhash, tx);
        });
        
        console.log(`[Client] RPC added ${rpcTxs.length} txs`);
      } catch (error) {
        console.log(`[Client] RPC ${rpcEndpoint} failed`);
      }
    }
  }
  
  // Convert to array and sort
  const uniqueTxs = Array.from(allTransactions.values());
  uniqueTxs.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  const dates = uniqueTxs.map(tx => new Date(tx.timestamp));
  const firstDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
  const lastDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
  
  console.log(`[Client] Complete: ${uniqueTxs.length} unique transactions`);

  return {
    transactions: uniqueTxs,
    metadata: {
      address,
      totalFetched: uniqueTxs.length,
      estimatedBlockchainTotal: totalReported,
      firstTransactionDate: firstDate?.toISOString(),
      lastTransactionDate: lastDate?.toISOString(),
      queryBreakdown: queryResults,
    },
  };
}

async function fetchWithPaginationClientSide(
  endpoint: string,
  query: string,
  onPage?: (count: number) => void,
  maxTxs: number = 10000
): Promise<{ transactions: OsmosisTransaction[]; total: string }> {
  const transactions: OsmosisTransaction[] = [];
  let nextKey: string | null = null;
  let totalCount: string = '0';
  let pageCount = 0;
  const BATCH_SIZE = 100;
  const MAX_PAGES = 50;
  
  do {
    pageCount++;
    
    const urlString: string = nextKey 
      ? `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.key=${encodeURIComponent(nextKey)}&pagination.limit=${BATCH_SIZE}&order_by=ORDER_BY_DESC`
      : `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.limit=${BATCH_SIZE}&order_by=ORDER_BY_DESC`;
    
    try {
      const response = await fetch(urlString, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        if (response.status === 500) {
          console.log(`[Client] Server error on page ${pageCount}`);
          break;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data: any = await response.json();
      const batch: OsmosisTransaction[] = data.tx_responses || [];
      
      if (batch.length > 0) {
        transactions.push(...batch);
        if (!totalCount || totalCount === '0') {
          totalCount = data.pagination?.total || '0';
        }
        
        if (onPage) {
          onPage(transactions.length);
        }
      }
      
      nextKey = data.pagination?.next_key;
      
      // Stop conditions
      if (transactions.length >= maxTxs) break;
      if (pageCount >= MAX_PAGES) break;
      
    } catch (error) {
      console.error(`[Client] Page ${pageCount} error:`, error);
      break;
    }
    
  } while (nextKey);
  
  return { 
    transactions, 
    total: totalCount 
  };
}

async function fetchFromRPCClientSide(
  rpcEndpoint: string,
  address: string
): Promise<OsmosisTransaction[]> {
  const transactions: OsmosisTransaction[] = [];
  
  const queries = [
    `transfer.recipient='${address}'`,
    `message.sender='${address}'`,
  ];
  
  for (const queryStr of queries) {
    try {
      const query = `"${queryStr}"`;
      const rpcUrl = `${rpcEndpoint}/tx_search?query=${encodeURIComponent(query)}&prove=false&page=1&per_page=30&order_by=desc`;
      
      const response = await fetch(rpcUrl, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) continue;
      
      const data: any = await response.json();
      
      if (data.result && data.result.txs) {
        for (const tx of data.result.txs) {
          const converted = convertTendermintToOsmosisFormatClientSide(tx);
          if (converted) {
            transactions.push(converted);
          }
        }
      }
    } catch (error) {
      console.log(`[Client] RPC query failed:`, error);
    }
  }
  
  return transactions;
}

function convertTendermintToOsmosisFormatClientSide(tx: any): OsmosisTransaction | null {
  try {
    if (!tx.hash) return null;
    
    return {
      txhash: tx.hash,
      height: String(tx.height || '0'),
      timestamp: new Date().toISOString(), // RPC doesn't always have timestamp
      code: tx.tx_result?.code || 0,
      tx: {
        body: {
          messages: [],
          memo: '',
        },
        auth_info: {
          fee: {
            amount: [],
          },
        },
      },
    };
  } catch (error) {
    return null;
  }
}

export function isValidOsmosisAddress(address: string): boolean {
  return /^osmo[a-z0-9]{39}$/i.test(address);
}

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
  };
  
  return denomMap[denom] || denom.toUpperCase();
}
