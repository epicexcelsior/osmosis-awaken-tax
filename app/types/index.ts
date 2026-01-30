// Types for Osmosis transactions and Awaken Tax CSV format

export interface OsmosisTransaction {
  txhash: string;
  height: string;
  timestamp: string;
  code: number;
  logs?: TxLog[];
  tx: {
    body: {
      messages: Message[];
      memo?: string;
    };
    auth_info: {
      fee?: {
        amount?: Coin[];
      };
    };
  };
}

export interface TxLog {
  msg_index: number;
  log: string;
  events: TxEvent[];
}

export interface TxEvent {
  type: string;
  attributes: Attribute[];
}

export interface Attribute {
  key: string;
  value: string;
}

export interface Message {
  '@type': string;
  from_address?: string;
  to_address?: string;
  sender?: string;
  receiver?: string;
  amount?: Coin[];
  token?: Coin;
  tokens?: Coin[];
}

export interface Coin {
  denom: string;
  amount: string;
}

// Awaken Tax CSV Format (Standard Transaction Format)
// Based on: Date, Received Quantity, Received Currency, Sent Quantity, Sent Currency, Fee Amount, Fee Currency, Notes
export interface AwakenTaxRow {
  'Date': string; // M/D/YY H:MM format (e.g., "2/6/23 11:29")
  'Received Quantity': string;
  'Received Currency': string;
  'Sent Quantity': string;
  'Sent Currency': string;
  'Fee Amount': string;
  'Fee Currency': string;
  'Notes': string;
}

// Awaken Tax CSV Format (Perpetuals/Trading Format)
// Based on: example.csv
// Columns: Date, Asset, Amount, Fee, P&L, Payment Token, ID, Notes, Tag, Transaction Hash
export interface AwakenTaxTradingRow {
  'Date': string; // YYYY-MM-DD format
  'Asset': string;
  'Amount': string;
  'Fee': string;
  'P&L': string;
  'Payment Token': string;
  'ID': string;
  'Notes': string;
  'Tag': string; // open_position, close_position, funding_payment
  'Transaction Hash': string;
}

// CSV Export format type
export type CSVFormat = 'standard' | 'trading';

// Simplified transaction for UI display
export interface ParsedTransaction {
  hash: string;
  timestamp: Date;
  height: number;
  type: TransactionType;
  from: string;
  to: string;
  amount: string;
  currency: string;
  fee: string;
  feeCurrency: string;
  memo: string;
  status: 'success' | 'failed';
}

export type TransactionType = 
  | 'send'
  | 'receive'
  | 'swap'
  | 'ibc_transfer'
  | 'delegate'
  | 'undelegate'
  | 'claim_rewards'
  | 'pool_deposit'
  | 'pool_withdraw'
  | 'governance_vote'
  | 'unknown';

// API Configuration
export interface ApiConfig {
  mintscanApiKey?: string;
  lcdEndpoint: string;
  rpcEndpoint: string;
}

// Component Props
export interface WalletInputProps {
  onSubmit: (address: string) => void;
  isLoading: boolean;
}

export interface TransactionTableProps {
  transactions: ParsedTransaction[];
  onDownloadCSV: () => void;
}
