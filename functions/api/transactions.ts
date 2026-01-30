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

// Working LCD endpoints
const LCD_ENDPOINTS = [
  'https://lcd.osmosis.zone',
  'https://osmosis-api.polkachu.com',
  'https://rest-osmosis.blockapsis.com',
];

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, string>;
}) {
  const { request } = context;
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);

  if (!address) {
    return new Response(
      JSON.stringify({ error: 'Address parameter is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Try each LCD endpoint
  for (const lcdEndpoint of LCD_ENDPOINTS) {
    try {
      // CRITICAL FIX: Use 'query=' not 'events='
      // Format: query=message.sender='ADDRESS'
      const senderQuery = `message.sender='${address}'`;
      const recipientQuery = `transfer.recipient='${address}'`;
      
      const senderUrl = `${lcdEndpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(senderQuery)}&pagination.limit=${limit}&order_by=ORDER_BY_DESC`;
      const recipientUrl = `${lcdEndpoint}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(recipientQuery)}&pagination.limit=${limit}&order_by=ORDER_BY_DESC`;
      
      console.log(`[LCD] ${lcdEndpoint} - Sender: ${senderUrl}`);
      
      const [senderResponse, recipientResponse] = await Promise.all([
        fetch(senderUrl, { headers: { 'Accept': 'application/json' } }),
        fetch(recipientUrl, { headers: { 'Accept': 'application/json' } }),
      ]);

      let senderTxs: OsmosisTransaction[] = [];
      let recipientTxs: OsmosisTransaction[] = [];

      if (senderResponse.ok) {
        const data = await senderResponse.json();
        senderTxs = data.tx_responses || [];
        console.log(`[LCD] ${lcdEndpoint} - Sender txs: ${senderTxs.length}`);
      }

      if (recipientResponse.ok) {
        const data = await recipientResponse.json();
        recipientTxs = data.tx_responses || [];
        console.log(`[LCD] ${lcdEndpoint} - Recipient txs: ${recipientTxs.length}`);
      }

      // If we got any transactions, return them
      if (senderTxs.length > 0 || recipientTxs.length > 0) {
        const allTxs = [...senderTxs, ...recipientTxs];
        const uniqueTxs = Array.from(
          new Map(allTxs.map((tx: OsmosisTransaction) => [tx.txhash, tx])).values()
        );

        uniqueTxs.sort((a: OsmosisTransaction, b: OsmosisTransaction) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        return new Response(
          JSON.stringify({
            transactions: uniqueTxs.slice(0, limit),
            total: uniqueTxs.length,
            endpoint: lcdEndpoint,
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
    } catch (error) {
      console.error(`[LCD] ${lcdEndpoint} error:`, error);
    }
  }

  // If all endpoints failed
  return new Response(
    JSON.stringify({
      transactions: [],
      total: 0,
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
