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

// Mintscan API Configuration
const MINTSCAN_API_KEY = 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM2NywiaWF0IjoxNzY5ODEzMTMzfQ.fssPTYzAgdlHGlNkypDmMVFV_dY5mHycPtt18ud0N1YakQ_F_d_2CPrS59UUZgW05sbRE-1w-I1o22qh7SKF3g';
const MINTSCAN_BASE_URL = 'https://apis.mintscan.io';

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, string>;
}) {
  const { request } = context;
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const limit = parseInt(url.searchParams.get('limit') || '10000', 10);

  if (!address) {
    return new Response(
      JSON.stringify({ error: 'Address parameter is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[Mintscan] Fetching all transactions for ${address}`);
  
  try {
    const allTransactions: OsmosisTransaction[] = [];
    let searchAfter: string | null = null;
    let pageCount = 0;
    let totalCount = 0;
    const MAX_PAGES = 500; // Safety limit
    
    do {
      pageCount++;
      
      // Build URL with pagination
      let mintscanUrl: string;
      if (searchAfter) {
        mintscanUrl = `${MINTSCAN_BASE_URL}/v1/osmosis/accounts/${address}/transactions?take=100&searchAfter=${encodeURIComponent(searchAfter)}`;
      } else {
        mintscanUrl = `${MINTSCAN_BASE_URL}/v1/osmosis/accounts/${address}/transactions?take=100`;
      }
      
      console.log(`[Mintscan] Page ${pageCount}: ${mintscanUrl.substring(0, 80)}...`);
      
      const response = await fetch(mintscanUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${MINTSCAN_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[Mintscan] Error ${response.status}: ${errorText}`);
        throw new Error(`Mintscan API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      // Mintscan returns data in response.data array
      const mintscanTxs = data.data || [];
      const pagination = data.pagination || {};
      
      console.log(`[Mintscan] Page ${pageCount}: Got ${mintscanTxs.length} txs, hasMore: ${!!pagination.searchAfter}`);
      
      if (mintscanTxs.length > 0) {
        // Convert Mintscan format to our format
        const converted = mintscanTxs.map((tx: any) => convertMintscanToOsmosisFormat(tx));
        allTransactions.push(...converted);
        
        if (pagination.total) {
          totalCount = parseInt(pagination.total, 10);
        }
      }
      
      // Get next page token
      searchAfter = pagination.searchAfter || null;
      
      // Stop conditions
      if (allTransactions.length >= limit) {
        console.log(`[Mintscan] Hit limit: ${allTransactions.length} transactions`);
        break;
      }
      
      if (pageCount >= MAX_PAGES) {
        console.log(`[Mintscan] Hit max pages: ${MAX_PAGES}`);
        break;
      }
      
      // If no more pages, stop
      if (!searchAfter) {
        console.log(`[Mintscan] No more pages (searchAfter is null)`);
        break;
      }
      
    } while (searchAfter);
    
    console.log(`[Mintscan] Complete: ${allTransactions.length} transactions from ${pageCount} pages`);
    
    // Sort by timestamp (newest first)
    allTransactions.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Get date range
    const dates = allTransactions.map(tx => new Date(tx.timestamp));
    const firstDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const lastDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    
    const metadata = {
      address,
      totalFetched: allTransactions.length,
      totalReported: totalCount,
      pagesFetched: pageCount,
      firstTransactionDate: firstDate?.toISOString(),
      lastTransactionDate: lastDate?.toISOString(),
      dataSource: 'Mintscan API (apis.mintscan.io)',
      queryType: 'v1/accounts/transactions with pagination',
    };

    return new Response(
      JSON.stringify({
        transactions: allTransactions.slice(0, limit),
        metadata,
        verification: {
          complete: allTransactions.length >= totalCount * 0.95 || !searchAfter,
          message: !searchAfter 
            ? `✓ Complete dataset: ${allTransactions.length} transactions (${firstDate?.toLocaleDateString()} - ${lastDate?.toLocaleDateString()}) via Mintscan`
            : `⚠ Fetched ${allTransactions.length} of ~${totalCount} transactions (pagination incomplete)`,
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
    console.error(`[Mintscan] Failed:`, error);
    
    // Fallback to LCD
    return fallbackToLCD(address, limit);
  }
}

async function fallbackToLCD(address: string, limit: number): Promise<Response> {
  const LCD_ENDPOINTS = [
    'https://lcd.osmosis.zone',
    'https://osmosis-api.polkachu.com',
    'https://rest-osmosis.blockapsis.com',
  ];
  
  const allTransactions = new Map<string, OsmosisTransaction>();
  const BATCH_SIZE = 100;
  const queryTypes = [
    `message.sender='${address}'`,
    `transfer.recipient='${address}'`,
    `ibc_transfer.sender='${address}'`,
    `ibc_transfer.receiver='${address}'`,
    `delegate.delegator_address='${address}'`,
    `withdraw_rewards.delegator_address='${address}'`,
  ];
  
  for (const endpoint of LCD_ENDPOINTS) {
    try {
      for (const query of queryTypes) {
        let nextKey: string | null = null;
        let pageCount = 0;
        
        do {
          pageCount++;
          const urlString: string = nextKey 
            ? `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.key=${encodeURIComponent(nextKey)}&pagination.limit=${BATCH_SIZE}`
            : `${endpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.limit=${BATCH_SIZE}`;
          
          const fetchResponse = await fetch(urlString, { headers: { 'Accept': 'application/json' } });
          
          if (fetchResponse.ok) {
            const responseData: any = await fetchResponse.json();
            const batch: OsmosisTransaction[] = responseData.tx_responses || [];
            batch.forEach((tx: OsmosisTransaction) => allTransactions.set(tx.txhash, tx));
            nextKey = responseData.pagination?.next_key;
          } else {
            break;
          }
          
          if (pageCount >= 20 || allTransactions.size >= limit) break;
        } while (nextKey);
      }
      
      if (allTransactions.size > 0) break;
    } catch (error) {
      console.error(`[LCD] ${endpoint} failed`);
    }
  }
  
  const uniqueTxs = Array.from(allTransactions.values());
  uniqueTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  const dates = uniqueTxs.map(tx => new Date(tx.timestamp));
  const firstDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
  const lastDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
  
  return new Response(
    JSON.stringify({
      transactions: uniqueTxs.slice(0, limit),
      metadata: {
        address,
        totalFetched: uniqueTxs.length,
        firstTransactionDate: firstDate?.toISOString(),
        lastTransactionDate: lastDate?.toISOString(),
        dataSource: 'LCD API (fallback)',
      },
      verification: {
        complete: false,
        message: `Partial data via LCD: ${uniqueTxs.length} transactions`,
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

function convertMintscanToOsmosisFormat(mintscanTx: any): OsmosisTransaction {
  return {
    txhash: mintscanTx.tx_hash || mintscanTx.hash || mintscanTx.id || '',
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
