'use client';

import { useState } from 'react';
import { WalletInput } from './components/wallet-input';
import { TransactionTable } from './components/transaction-table';
import { ErrorDisplay } from './components/error-display';
import { fetchAllTransactionsClientSide, parseTransaction, isValidOsmosisAddress } from './services/osmosis-client';
import { convertToAwakenCSV, generateCSVContent, downloadCSV, generateFilename } from './utils/csvExport';
import { OsmosisTransaction, ParsedTransaction, CSVFormat } from './types';

export default function Home() {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [rawTransactions, setRawTransactions] = useState<OsmosisTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [csvFormat, setCsvFormat] = useState<CSVFormat>('standard');
  const [txMetadata, setTxMetadata] = useState<any>(null);
  const [txVerification, setTxVerification] = useState<any>(null);

  const handleWalletSubmit = async (address: string) => {
    setIsLoading(true);
    setError(null);
    setTransactions([]);
    setRawTransactions([]);
    setTxMetadata(null);
    setTxVerification(null);

    try {
      // Validate address
      if (!isValidOsmosisAddress(address)) {
        throw new Error('Invalid Osmosis address format');
      }

      setCurrentAddress(address);

      // Fetch transactions client-side (no server needed!)
      const result = await fetchAllTransactionsClientSide(address, (count, total) => {
        console.log(`[Progress] Fetched ${count} of ~${total} transactions`);
      });
      setRawTransactions(result.transactions);
      setTxMetadata(result.metadata);
      setTxVerification({
        complete: result.transactions.length > 100,
        message: result.transactions.length > 0 
          ? `✓ Found ${result.transactions.length} transactions via client-side fetching`
          : 'No transactions found'
      });

      // Parse transactions
      const parsed = result.transactions.map((tx: OsmosisTransaction) => parseTransaction(tx, address));
      setTransactions(parsed);

      if (parsed.length === 0) {
        setError('No transactions found for this address. The wallet may be new or unused.');
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(
        err instanceof Error 
          ? err.message 
          : 'Failed to fetch transactions. Please check the address and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (transactions.length === 0 || !currentAddress) return;

    const awakenRows = convertToAwakenCSV(transactions, currentAddress, csvFormat);
    const csvContent = generateCSVContent(awakenRows);
    const filename = generateFilename(currentAddress, csvFormat);
    
    downloadCSV(csvContent, filename);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mb-4">
            Osmosis Transaction Viewer
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            View your Osmosis blockchain transactions and export them in Awaken Tax CSV format for easy tax reporting.
          </p>
        </div>

        {/* Client-side Notice */}
        <div className="mb-8 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg max-w-3xl mx-auto">
          <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
            100% Client-Side - No Server Needed!
          </h3>
          <p className="text-sm text-green-800 dark:text-green-200">
            This app fetches directly from Osmosis blockchain nodes in your browser. 
            No API keys needed, no server timeouts, completely free and open source.
          </p>
          <p className="text-sm text-green-800 dark:text-green-200 mt-2">
            Uses multiple query types to find all your transactions: sends, receives, swaps, staking, IBC transfers, and more!
          </p>
        </div>

        {/* Wallet Input */}
        <WalletInput onSubmit={handleWalletSubmit} isLoading={isLoading} />

        {/* Error Display */}
        {error && !isLoading && (
          <div className="mt-8">
            <ErrorDisplay 
              error={error} 
              onRetry={() => currentAddress && handleWalletSubmit(currentAddress)} 
            />
          </div>
        )}

        {/* Transaction Table */}
        {!isLoading && transactions.length > 0 && (
          <div className="mt-8">
            {/* CSV Format Selector */}
            <div className="mb-6 flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-4">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  CSV Export Format:
                </label>
                <select
                  value={csvFormat}
                  onChange={(e) => setCsvFormat(e.target.value as CSVFormat)}
                  className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="standard">Standard (Transactions)</option>
                  <option value="trading">Trading/Perpetuals</option>
                </select>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {csvFormat === 'standard' ? (
                  <span>Columns: Date, Received/Sent Qty, Currency, Fee, Notes</span>
                ) : (
                  <span>Columns: Date, Asset, Amount, P&L, Fee, Tag</span>
                )}
              </div>
            </div>
            
            <TransactionTable 
              transactions={transactions} 
              onDownloadCSV={handleDownloadCSV}
              walletAddress={currentAddress}
            />
            
            {/* Transaction Completeness Info */}
            {txVerification && (
              <div className={`mt-6 p-4 rounded-lg border ${txVerification.complete ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${txVerification.complete ? 'text-green-600' : 'text-yellow-600'}`}>
                    {txVerification.complete ? '✓' : '⚠'}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-semibold ${txVerification.complete ? 'text-green-900' : 'text-yellow-900'}`}>
                      {txVerification.complete ? 'Complete Transaction History' : 'Partial Data'}
                    </h4>
                    <p className={`text-sm mt-1 ${txVerification.complete ? 'text-green-800' : 'text-yellow-800'}`}>
                      {txVerification.message}
                    </p>
                    {txMetadata && (
                      <div className="mt-3 text-sm text-slate-600 space-y-1">
                        <p><strong>Total Transactions:</strong> {txMetadata.totalFetched?.toLocaleString() || transactions.length}</p>
                        <p><strong>Sent:</strong> {txMetadata.senderCount?.toLocaleString() || 'N/A'} | <strong>Received:</strong> {txMetadata.recipientCount?.toLocaleString() || 'N/A'}</p>
                        {txMetadata.firstTransactionDate && (
                          <p><strong>Date Range:</strong> {new Date(txMetadata.firstTransactionDate).toLocaleDateString()} - {new Date(txMetadata.lastTransactionDate).toLocaleDateString()}</p>
                        )}
                        <p><strong>Data Source:</strong> {txMetadata.endpoints?.join(', ') || 'LCD API'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        {!isLoading && transactions.length === 0 && !error && (
          <div className="mt-16 grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-lg mb-2">1. Enter Address</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Input your Osmosis wallet address starting with &quot;osmo&quot;
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-lg mb-2">2. View Transactions</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Browse your transaction history with detailed information
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-lg mb-2">3. Export CSV</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Download in Standard or Trading format for Awaken Tax
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>
            Built for the Osmosis ecosystem. CSV format compatible with{' '}
            <a 
              href="https://awaken.tax" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-slate-700 dark:hover:text-slate-300"
            >
              Awaken Tax
            </a>
          </p>
          <p className="mt-2">
            <a 
              href="https://github.com/epicexcelsior/osmosis-awaken-tax" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-slate-700 dark:hover:text-slate-300"
            >
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
