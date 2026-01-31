# Quickstart: Add New Chain Support

## Goal
Fetch complete transaction history + CSV export in Awaken Tax format.

## Requirements Checklist
- [ ] Fetch ALL transactions (not just recent)
- [ ] Support pagination (100+ transactions)
- [ ] Include token transfers (ERC20/NFTs if applicable)
- [ ] 100% cost basis accuracy in Awaken Tax
- [ ] Client-side fetching (no server)

## CSV Format (Awaken Standard)
```
Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Notes,Tag
```

**Notes must include:**
- Full transaction hash: `[TX: 0xabc123...]`
- From/To addresses: `(0x267c40... -> 0x9d3936...)`
- Token details for multi-asset

## Implementation Steps

### 1. Research API (30 min)
Test with real address, verify:
- ✅ Pagination works (fetch 1000+ transactions)
- ✅ Token transfers included
- ✅ Rate limits manageable (3-5 req/sec)
- ✅ Free tier available

**Good APIs:**
- Etherscan v2 (EVM chains)
- Celenium (Celestia)
- GoldRush/Covalent (Ronin)
- Pikespeak (NEAR)

**Avoid:**
- Cosmos LCD (pruned indexes, only 1-4 tx)
- Tatum API v4 (deprecated, 50 tx limit)

### 2. Create Client (app/services/{chain}-client.ts)

```typescript
const CHAIN_ID = "chainname";
const API_KEY = "your-key";
const BASE_URL = "https://api.example.com";
const DELAY_MS = 350; // For 3/sec rate limit

export async function fetchAllTransactionsClientSide(
  address: string,
  onProgress?: (count: number) => void
) {
  // 1. Paginate through all pages
  // 2. Handle rate limiting
  // 3. Return { transactions, metadata }
}

// CRITICAL: Token symbol caching
const tokenCache = new Map();
function getTokenSymbol(contract: string, apiSymbol: string) {
  const key = contract.toLowerCase();
  if (tokenCache.has(key)) return tokenCache.get(key);
  const symbol = apiSymbol || contract.slice(0, 10);
  tokenCache.set(key, symbol);
  return symbol;
}
```

### 3. Update Configs
- `app/types/index.ts`: Add to ChainId union
- `app/config/chains.ts`: Add chain config
- `app/page.tsx`: Add chain handler to switch statement
- `public/chains/{chain}.svg`: Add icon

### 4. Test Checklist
**API Test:**
```bash
# Test with high-activity address
node test-address.mjs 0x... chainname
# Should fetch 1000+ transactions
```

**CSV Test:**
- [ ] Download works
- [ ] Opens in Excel/Sheets
- [ ] Date format: M/D/YY H:MM
- [ ] All tx hashes present
- [ ] No empty required fields

**Cost Basis Test:**
- Import to Awaken Tax
- Target: >95% calculated
- Check: No unmatched transactions
- Verify: Token symbols consistent

### 5. Deploy
```bash
npm run build
npx wrangler pages deploy dist
```

## Critical Best Practices

**Cost Basis = Top Priority:**
1. Token symbol caching (consistent across all tx)
2. Full transaction hashes in Notes
3. From/To addresses in Notes
4. Proper date format

**Rate Limiting:**
- Add 350ms delays between requests
- Etherscan: 3/sec
- Most others: 5-10/sec

**Error Handling:**
- Handle API errors gracefully
- Return partial data if available
- Clear error messages for users

## Attribution (Required!)
Add to footer:
```
Data provided by [API_NAME] API
```

Examples:
- Etherscan: "Data provided by Etherscan.io API"
- Celenium: "Powered by Celenium API"

## Common Mistakes
❌ Skipping pagination (only first 100)
❌ No token symbol caching
❌ Missing transaction hashes
❌ Wrong date format
❌ No API attribution

## Time Estimate
- Research: 30 min
- Implementation: 2-3 hours
- Testing: 1 hour
- **Total: 4-5 hours**

## Test Addresses by Chain
- Celo: `0xD23Bfd31430eFB9c8358b703B62BdE17F36E1274` (306 tx)
- Ronin: `0x267c406d26a4b43614df329d4f2ae6773cb630b2` (1,401 tx)
- Celestia: `celestia16na4yg4rtt4n8j72n54uy5mvxn7f08l76lxpup` (1,982 tx)

---
**Success = Complete history + 100% cost basis + CSV export**
