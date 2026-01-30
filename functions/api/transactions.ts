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

const RPC_ENDPOINTS = [
  'https://rpc.osmosis.zone',
  'https://osmosis-rpc.polkachu.com',
];

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, string>;
}) {
  const { request } = context;
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5000', 10), 10000);

  if (!address) {
    return new Response(
      JSON.stringify({ error: 'Address parameter is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[RPC] Fetching for ${address}`);
  
  const allTransactions = new Map<string, OsmosisTransaction>();
  let totalFound = 0;
  
  // Try each RPC endpoint
  for (const rpcEndpoint of RPC_ENDPOINTS) {
    console.log(`[RPC] Trying ${rpcEndpoint}`);
    
    try {
      // Query types to try
      const queries = [
        `transfer.recipient='${address}'`,
        `transfer.sender='${address}'`,
        `message.sender='${address}'`,
      ];
      
      for (const queryStr of queries) {
        const query = `"${queryStr}"`;
        let page = 1;
        let hasMore = true;
        let endpointTotal = 0;
        
        while (hasMore && page <= 50 && allTransactions.size < limit) {
          try {
            const rpcUrl = `${rpcEndpoint}/tx_search?query=${encodeURIComponent(query)}&prove=false&page=${page}&per_page=30&order_by=desc`;
            
            console.log(`[RPC] ${queryStr} page ${page}`);
            
            const response = await fetch(rpcUrl, {
              headers: { 'Accept': 'application/json' },
            });
            
            if (!response.ok) {
              console.log(`[RPC] Error ${response.status}`);
              break;
            }
            
            const data: any = await response.json();
            
            if (data.error) {
              console.log(`[RPC] RPC error:`, data.error);
              break;
            }
            
            const result = data.result;
            if (!result || !result.txs) {
              console.log(`[RPC] No txs in result`);
              break;
            }
            
            const txs = result.txs;
            endpointTotal = parseInt(result.total_count || '0', 10);
            
            console.log(`[RPC] Got ${txs.length} txs (total: ${endpointTotal})`);
            
            // Add transactions
            for (const tx of txs) {
              const converted = convertTendermintToOsmosisFormat(tx);
              if (converted && converted.txhash) {
                allTransactions.set(converted.txhash, converted);
              }
            }
            
            // Check for more pages
            hasMore = txs.length === 30 && page * 30 < endpointTotal;
            
            if (!hasMore) {
              console.log(`[RPC] No more pages for ${queryStr}`);
              break;
            }
            
          } catch (error) {
            console.error(`[RPC] Error on page ${page}:`, error);
            break;
          }
          
          page++;
        }
        
        totalFound += endpointTotal;
      }
      
      if (allTransactions.size > 0) {
        console.log(`[RPC] Found ${allTransactions.size} txs from ${rpcEndpoint}`);
        break;
      }
      
    } catch (error) {
      console.error(`[RPC] ${rpcEndpoint} failed:`, error);
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
  
  console.log(`[RPC] Complete: ${uniqueTxs.length} unique txs`);

  return new Response(
    JSON.stringify({
      transactions: uniqueTxs.slice(0, limit),
      metadata: {
        address,
        totalFetched: uniqueTxs.length,
        totalFromRPC: totalFound,
        firstTransactionDate: firstDate?.toISOString(),
        lastTransactionDate: lastDate?.toISOString(),
        dataSource: 'Tendermint RPC (tx_search)',
      },
      verification: {
        complete: uniqueTxs.length >= totalFound * 0.9,
        message: uniqueTxs.length > 0
          ? `✓ Found ${uniqueTxs.length} transactions (${firstDate?.toLocaleDateString()} - ${lastDate?.toLocaleDateString()})`
          : `No transactions found`,
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
}

function convertTendermintToOsmosisFormat(tx: any): OsmosisTransaction | null {
  try {
    if (!tx.hash) return null;
    
    // Get timestamp from tx_result.events
    let timestamp = new Date().toISOString();
    if (tx.tx_result && tx.tx_result.events) {
      // Look for timestamp in events
      for (const event of tx.tx_result.events) {
        if (event.attributes) {
          for (const attr of event.attributes) {
            if (attr.key === 'timestamp' || attr.key === 'time') {
              timestamp = attr.value;
              break;
            }
          }
        }
      }
    }
    
    return {
      txhash: tx.hash,
      height: String(tx.height || '0'),
      timestamp: timestamp,
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
    console.error(`[Convert] Error:`, error);
    return null;
  }
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
