interface OsmosisTransaction {
  txhash: string;
  height: string;
  timestamp: string;
  code: number;
  tx: {
    body: {
      messages: any[];
      memo?: string;
    };
    auth_info: {
      fee?: {
        amount?: any[];
      };
    };
  };
}

interface PaginationInfo {
  next_key: string | null;
  total: string;
}

// Working LCD endpoints
const LCD_ENDPOINTS = [
  'https://lcd.osmosis.zone',
  'https://osmosis-api.polkachu.com',
  'https://rest-osmosis.blockapsis.com',
];

const MAX_TRANSACTIONS = 10000; // Safety limit for tax reporting
const BATCH_SIZE = 100; // LCD API limit per request

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, string>;
}) {
  const { request } = context;
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000', 10), MAX_TRANSACTIONS);

  if (!address) {
    return new Response(
      JSON.stringify({ error: 'Address parameter is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const allTransactions: OsmosisTransaction[] = [];
  const metadata = {
    address,
    endpoints: [] as string[],
    totalFetched: 0,
    senderCount: 0,
    recipientCount: 0,
    firstTransactionDate: null as string | null,
    lastTransactionDate: null as string | null,
    hasMoreData: false,
  };

  // Try each LCD endpoint
  for (const lcdEndpoint of LCD_ENDPOINTS) {
    try {
      console.log(`[LCD] Fetching from ${lcdEndpoint}...`);
      
      const senderQuery = `message.sender='${address}'`;
      const recipientQuery = `transfer.recipient='${address}'`;
      
      // Fetch ALL sender transactions with pagination
      const senderResult = await fetchAllTransactionsWithPagination(
        lcdEndpoint,
        senderQuery,
        limit
      );
      
      // Fetch ALL recipient transactions with pagination  
      const recipientResult = await fetchAllTransactionsWithPagination(
        lcdEndpoint,
        recipientQuery,
        limit
      );
      
      metadata.senderCount = senderResult.transactions.length;
      metadata.recipientCount = recipientResult.transactions.length;
      
      // Combine and deduplicate
      const combined = [...senderResult.transactions, ...recipientResult.transactions];
      const uniqueMap = new Map<string, OsmosisTransaction>();
      
      for (const tx of combined) {
        if (!uniqueMap.has(tx.txhash)) {
          uniqueMap.set(tx.txhash, tx);
        }
      }
      
      const uniqueTxs = Array.from(uniqueMap.values());
      
      // Sort by timestamp (newest first)
      uniqueTxs.sort((a: OsmosisTransaction, b: OsmosisTransaction) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      metadata.totalFetched = uniqueTxs.length;
      metadata.endpoints.push(lcdEndpoint);
      
      if (uniqueTxs.length > 0) {
        metadata.firstTransactionDate = uniqueTxs[uniqueTxs.length - 1].timestamp;
        metadata.lastTransactionDate = uniqueTxs[0].timestamp;
        metadata.hasMoreData = senderResult.hasMore || recipientResult.hasMore;
      }
      
      return new Response(
        JSON.stringify({
          transactions: uniqueTxs.slice(0, limit),
          metadata,
          verification: {
            complete: !metadata.hasMoreData,
            message: metadata.hasMoreData 
              ? `Showing first ${Math.min(uniqueTxs.length, limit)} of ${metadata.totalFetched}+ transactions. Use higher limit to fetch more.`
              : `Complete transaction history: ${uniqueTxs.length} transactions from ${metadata.firstTransactionDate?.split('T')[0]} to ${metadata.lastTransactionDate?.split('T')[0]}`,
          }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
      
    } catch (error) {
      console.error(`[LCD] ${lcdEndpoint} error:`, error);
    }
  }

  // If all endpoints failed
  return new Response(
    JSON.stringify({
      transactions: [],
      metadata,
      error: 'No transactions found from any endpoint',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

async function fetchAllTransactionsWithPagination(
  endpoint: string,
  query: string,
  maxTxs: number
): Promise<{ transactions: OsmosisTransaction[]; hasMore: boolean; total?: string }> {
  const transactions: OsmosisTransaction[] = [];
  let nextKey: string | null = null;
  let hasMore = false;
  let totalCount: string = '0';
  
  do {
    const url = nextKey 
      ? `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.key=${encodeURIComponent(nextKey)}&pagination.limit=${BATCH_SIZE}&order_by=ORDER_BY_DESC`
      : `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.limit=${BATCH_SIZE}&order_by=ORDER_BY_DESC`;
    
    console.log(`[Pagination] Fetching: ${url.substring(0, 120)}...`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`[Pagination] Error ${response.status}: ${await response.text().catch(() => 'Unknown')}`);
      break;
    }
    
    const data = await response.json();
    const batch: OsmosisTransaction[] = data.tx_responses || [];
    const pagination: PaginationInfo = data.pagination || { next_key: null, total: '0' };
    
    if (batch.length > 0) {
      transactions.push(...batch);
      totalCount = pagination.total;
      console.log(`[Pagination] Got ${batch.length} txs (total so far: ${transactions.length}/${totalCount})`);
    }
    
    nextKey = pagination.next_key;
    hasMore = !!nextKey;
    
    // Stop if we hit the limit
    if (transactions.length >= maxTxs) {
      console.log(`[Pagination] Hit limit of ${maxTxs} transactions`);
      hasMore = true; // Indicate there might be more
      break;
    }
    
  } while (nextKey);
  
  return { 
    transactions: transactions.slice(0, maxTxs), 
    hasMore,
    total: totalCount 
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
