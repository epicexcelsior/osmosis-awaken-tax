import { OsmosisTransaction, ParsedTransaction, TransactionType } from '../types';

/**
 * Client-side transaction fetcher with proper LCD pagination
 * Uses pagination.offset to fetch ALL transactions (not just 100!)
 */
export async function fetchAllTransactionsClientSide(
  address: string,
  onProgress?: (count: number, total: number) => void
): Promise<{ transactions: OsmosisTransaction[]; metadata: any }> {
  console.log(`[Client] Starting comprehensive fetch for ${address}`);
  
  const allTransactions = new Map<string, OsmosisTransaction>();
  const LCD_ENDPOINTS = [
    'https://lcd.osmosis.zone',
    'https://osmosis-api.polkachu.com',
    'https://rest-osmosis.blockapsis.com',
  ];
  
  // Query types to try
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
    { name: 'set_withdraw_address', query: `set_withdraw_address.delegator_address='${address}'` },
    { name: 'swap_exact_amount_in', query: `swap_exact_amount_in.sender='${address}'` },
    { name: 'swap_exact_amount_out', query: `swap_exact_amount_out.sender='${address}'` },
    { name: 'join_pool', query: `join_pool.sender='${address}'` },
    { name: 'exit_pool', query: `exit_pool.sender='${address}'` },
    { name: 'lock_tokens', query: `lock_tokens.owner='${address}'` },
    { name: 'begin_unlocking', query: `begin_unlocking.owner='${address}'` },
    { name: 'vote', query: `vote.voter='${address}'` },
    { name: 'submit_proposal', query: `submit_proposal.proposer='${address}'` },
    { name: 'deposit', query: `deposit.depositor='${address}'` },
    { name: 'send', query: `send.from_address='${address}'` },
    { name: 'create_denom', query: `create_denom.sender='${address}'` },
    { name: 'mint', query: `mint.sender='${address}'` },
    { name: 'burn', query: `burn.sender='${address}'` },
  ];
  
  let totalReported = 0;
  let lastSuccessfulEndpoint = '';
  
  // Try each endpoint
  for (const endpoint of LCD_ENDPOINTS) {
    console.log(`[Client] Trying LCD: ${endpoint}`);
    let endpointSuccess = false;
    
    for (const queryType of queryTypes) {
      let offset = 0;
      let hasMore = true;
      let queryTotal = 0;
      let pagesFetched = 0;
      const MAX_PAGES = 50; // Safety limit
      
      while (hasMore && pagesFetched < MAX_PAGES) {
        try {
          const url = `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(queryType.query)}&pagination.offset=${offset}&pagination.limit=100&order_by=ORDER_BY_DESC`;
          
          if (pagesFetched === 0) {
            console.log(`[Client] ${queryType.name} - offset ${offset}...`);
          }
          
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
          });
          
          if (!response.ok) {
            if (response.status === 500) {
              console.log(`[Client] ${queryType.name} - Server error, stopping`);
              break;
            }
            throw new Error(`HTTP ${response.status}`);
          }
          
          const data: any = await response.json();
          const batch: OsmosisTransaction[] = data.tx_responses || [];
          
          if (batch.length === 0) {
            hasMore = false;
            break;
          }
          
          // Add transactions
          for (const tx of batch) {
            if (tx.txhash) {
              allTransactions.set(tx.txhash, tx);
            }
          }
          
          // Get total on first page
          if (offset === 0 && data.pagination?.total) {
            queryTotal = parseInt(data.pagination.total, 10);
            totalReported += queryTotal;
          }
          
          if (onProgress) {
            onProgress(allTransactions.size, totalReported);
          }
          
          // Check if we need more pages
          hasMore = batch.length === 100;
          
          if (!hasMore) {
            console.log(`[Client] ${queryType.name}: ${allTransactions.size} total unique (fetched ${pagesFetched + 1} pages, ${batch.length} on last page)`);
          }
          
          offset += 100;
          pagesFetched++;
          
          // Small delay to avoid rate limiting
          if (pagesFetched % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
        } catch (error) {
          console.error(`[Client] ${queryType.name} offset ${offset} error:`, error);
          hasMore = false;
          break;
        }
      }
      
      if (pagesFetched > 0) {
        endpointSuccess = true;
        lastSuccessfulEndpoint = endpoint;
      }
    }
    
    // If we got significant data, stop trying other endpoints
    if (endpointSuccess && allTransactions.size > 100) {
      console.log(`[Client] Good data from ${endpoint}, stopping endpoint search`);
      break;
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
  
  console.log(`[Client] FINAL RESULT: ${uniqueTxs.length} unique transactions`);
  console.log(`[Client] Date range: ${firstDate?.toLocaleDateString()} - ${lastDate?.toLocaleDateString()}`);
  
  return {
    transactions: uniqueTxs,
    metadata: {
      address,
      totalFetched: uniqueTxs.length,
      estimatedBlockchainTotal: totalReported,
      firstTransactionDate: firstDate?.toISOString(),
      lastTransactionDate: lastDate?.toISOString(),
      dataSource: `LCD API with pagination (${lastSuccessfulEndpoint})`,
      queryTypesUsed: queryTypes.length,
    },
  };
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
