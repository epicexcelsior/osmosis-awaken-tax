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

const LCD_ENDPOINT = 'https://lcd.osmosis.zone';

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

  try {
    // Try to fetch from LCD endpoint
    const [senderResponse, receiverResponse] = await Promise.allSettled([
      fetch(`${LCD_ENDPOINT}/cosmos/tx/v1beta1/txs?events=transfer.sender='${address}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`, {
        headers: { 'Accept': 'application/json' },
      }),
      fetch(`${LCD_ENDPOINT}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`, {
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

    // Combine and deduplicate
    const allTxs = [...senderTxs, ...receiverTxs];
    const uniqueTxs = Array.from(
      new Map(allTxs.map((tx: OsmosisTransaction) => [tx.txhash, tx])).values()
    );

    // Sort by timestamp
    uniqueTxs.sort((a: OsmosisTransaction, b: OsmosisTransaction) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return new Response(
      JSON.stringify({
        transactions: uniqueTxs.slice(0, limit),
        total: uniqueTxs.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to fetch transactions', details: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
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
