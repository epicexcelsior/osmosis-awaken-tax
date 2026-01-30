import { AwakenTaxRow, AwakenTaxTradingRow, ParsedTransaction, CSVFormat } from '../types';

// Re-export CSVFormat for use in this file
export type { CSVFormat };

/**
 * Convert parsed transactions to Awaken Tax CSV format
 * Supports both standard transaction format and trading/perpetuals format
 * 
 * Standard Format Columns: Date, Received Quantity, Received Currency, Sent Quantity, Sent Currency, Fee Amount, Fee Currency, Notes
 * Trading Format Columns: Date, Asset, Amount, Fee, P&L, Payment Token, ID, Notes, Tag, Transaction Hash
 */
export function convertToAwakenCSV(
  transactions: ParsedTransaction[], 
  walletAddress: string,
  format: CSVFormat = 'standard'
): AwakenTaxRow[] | AwakenTaxTradingRow[] {
  if (format === 'trading') {
    return convertToTradingFormat(transactions, walletAddress);
  }
  return convertToStandardFormat(transactions, walletAddress);
}

/**
 * Convert to standard transaction format
 */
function convertToStandardFormat(transactions: ParsedTransaction[], walletAddress: string): AwakenTaxRow[] {
  return transactions.map((tx) => {
    // Format date as M/D/YY H:MM (e.g., "2/6/23 11:29")
    const date = formatDateForAwakenShort(tx.timestamp);
    
    // Determine received/sent based on transaction type
    let receivedQty = '';
    let receivedCurrency = '';
    let sentQty = '';
    let sentCurrency = '';
    
    if (tx.type === 'receive') {
      receivedQty = tx.amount;
      receivedCurrency = tx.currency;
    } else if (tx.type === 'send') {
      sentQty = tx.amount;
      sentCurrency = tx.currency;
    }
    
    return {
      'Date': date,
      'Received Quantity': receivedQty,
      'Received Currency': receivedCurrency,
      'Sent Quantity': sentQty,
      'Sent Currency': sentCurrency,
      'Fee Amount': tx.fee,
      'Fee Currency': tx.feeCurrency,
      'Notes': tx.memo || '',
    };
  });
}

/**
 * Convert to trading/perpetuals format
 */
function convertToTradingFormat(transactions: ParsedTransaction[], walletAddress: string): AwakenTaxTradingRow[] {
  return transactions.map((tx, index) => {
    // Format date as YYYY-MM-DD
    const date = formatDateForTrading(tx.timestamp);
    
    // For regular transactions, we don't have P&L data, so we'll use placeholder logic
    // In a real implementation, you'd parse swap events to determine P&L
    const isSend = tx.type === 'send';
    const amount = isSend ? `-${tx.amount}` : tx.amount;
    
    return {
      'Date': date,
      'Asset': tx.currency || 'UNKNOWN',
      'Amount': amount,
      'Fee': tx.fee,
      'P&L': '', // Would need additional data to calculate P&L
      'Payment Token': tx.feeCurrency || '',
      'ID': `TXN${String(index + 1).padStart(3, '0')}`,
      'Notes': tx.memo || `${tx.type} transaction`,
      'Tag': isSend ? 'close_position' : 'open_position',
      'Transaction Hash': tx.hash,
    };
  });
}

/**
 * Format date as required by Awaken Tax short format: M/D/YY H:MM
 * Example: "2/6/23 11:29"
 */
function formatDateForAwakenShort(date: Date): string {
  const utcDate = new Date(date.toISOString());
  
  const month = utcDate.getUTCMonth() + 1; // No leading zero
  const day = utcDate.getUTCDate(); // No leading zero
  const year = String(utcDate.getUTCFullYear()).slice(-2); // Last 2 digits
  const hours = utcDate.getUTCHours();
  const minutes = String(utcDate.getUTCMinutes()).padStart(2, '0'); // Leading zero for minutes
  
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

/**
 * Format date for trading format: YYYY-MM-DD
 * Example: "2024-01-15"
 */
function formatDateForTrading(date: Date): string {
  const utcDate = new Date(date.toISOString());
  
  const year = utcDate.getUTCFullYear();
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utcDate.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Generate CSV content from row array
 * Works with both standard and trading formats
 */
export function generateCSVContent(rows: (AwakenTaxRow | AwakenTaxTradingRow)[]): string {
  if (rows.length === 0) {
    return '';
  }
  
  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Create header row
  const headerRow = headers.join(',');
  
  // Create data rows
  const dataRows = rows.map((row) => {
    return headers.map((header) => {
      const value = row[header as keyof typeof row];
      // Escape values that contain commas, quotes, or newlines
      if (value && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  // Combine all rows
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download CSV file in browser
 */
export function downloadCSV(csvContent: string, filename: string): void {
  if (typeof window === 'undefined') {
    return; // Server-side, do nothing
  }
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  // Create download link
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Generate filename for the CSV export
 */
export function generateFilename(walletAddress: string, format: CSVFormat = 'standard'): string {
  const date = new Date().toISOString().split('T')[0];
  const shortAddress = walletAddress.slice(0, 8);
  const formatSuffix = format === 'trading' ? '-trading' : '';
  return `osmosis-awaken-${shortAddress}${formatSuffix}-${date}.csv`;
}
