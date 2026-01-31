# Multi-Chain Transaction Dashboard

A Next.js application that fetches blockchain transactions across multiple networks and exports them in Awaken Tax CSV format for easy tax reporting.

## Features

- **Multi-Chain Support**: View transactions across Osmosis, Babylon, NEAR, Celo, Fantom, Ronin, and Celestia
- **Transaction Viewing**: Enter any wallet address to view all transactions
- **CSV Export**: Export transactions in Awaken Tax compatible CSV format
- **100% Client-Side**: All fetching happens in your browser - no server needed
- **Multiple API Integrations**: Uses various indexed APIs for complete transaction history
- **Modern UI**: Built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui
- **Cloudflare Pages Ready**: Configured for easy deployment to Cloudflare Pages

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/epicexcelsior/osmosis-awaken-tax.git
cd osmosis-awaken-tax
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file (optional):
```bash
# Optional: Add Mintscan API key for higher rate limits
NEXT_PUBLIC_MINTSCAN_API_KEY=your_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Configuration

### Default (Free) - Osmosis LCD API
The app works out of the box using the free Osmosis LCD REST API endpoint:
- Endpoint: `https://lcd.osmosis.zone`
- No API key required
- Rate limits apply

### Optional - Mintscan API
For production use with higher rate limits, you can use the Mintscan API:
1. Sign up at [https://api.mintscan.io](https://api.mintscan.io)
2. Get your API key
3. Set the environment variable: `NEXT_PUBLIC_MINTSCAN_API_KEY`

### Additional API References

| Chain | API | Endpoint | API Key Required |
|-------|-----|----------|-----------------|
| Osmosis | LCD API | `https://lcd.osmosis.zone` | No |
| Babylon | AllThatNode REST | `https://babylon-mainnet.g.allthatnode.com` | Yes |
| NEAR | Pikespeak AI | `https://api.pikespeak.ai` | Yes |
| Celo | Blockscout API | `https://explorer.celo.org/api` | No |
| Fantom | Blockscout API | `https://explorer.fantom.network/api` | No |
| Ronin | GoldRush (Covalent) | `https://api.covalenthq.com` | Yes |
| Celestia | Celenium API | `https://api-mainnet.celenium.io` | No |

## Deployment

### Cloudflare Pages

This project is configured for Cloudflare Pages deployment using Wrangler.

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Build the project:
```bash
npm run build
```

4. Deploy:
```bash
wrangler pages deploy dist
```

### Environment Variables on Cloudflare

Set these in your Cloudflare Pages project settings:

- `NEXT_PUBLIC_LCD_ENDPOINT`: `https://lcd.osmosis.zone`
- `NEXT_PUBLIC_RPC_ENDPOINT`: `https://rpc.osmosis.zone`
- `NEXT_PUBLIC_MINTSCAN_API_KEY`: Your Mintscan API key (optional)

## Awaken Tax CSV Format

The exported CSV follows the Awaken Tax format specification:

| Column | Description |
|--------|-------------|
| Date | MM/DD/YYYY HH:MM:SS UTC |
| Received Quantity | Amount received (if applicable) |
| Received Currency | Currency code of received amount |
| Received Fiat Amount | Optional fiat value |
| Sent Quantity | Amount sent (if applicable) |
| Sent Currency | Currency code of sent amount |
| Sent Fiat Amount | Optional fiat value |
| Fee Amount | Transaction fee amount |
| Fee Currency | Fee currency code |
| Transaction Hash | Blockchain transaction hash |
| Notes | Transaction memo or notes |
| Tag | Transaction type tag (transfer, trade, staking, etc.) |

## Project Structure

```
├── app/
│   ├── components/          # React components
│   │   ├── wallet-input.tsx
│   │   ├── transaction-table.tsx
│   │   └── error-display.tsx
│   ├── services/            # API services
│   │   └── osmosis.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   └── csvExport.ts
│   ├── page.tsx            # Main page
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/ui/          # shadcn/ui components
├── public/                 # Static assets
├── next.config.ts          # Next.js configuration
├── wrangler.toml           # Cloudflare Pages config
└── package.json
```

## Technologies

- [Next.js 15](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [CosmJS](https://github.com/cosmos/cosmjs) - Cosmos SDK integration
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - Cloudflare deployment

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for your own projects.

## Attributions

This project uses the following APIs and services:

- **Celenium API** (Celestia): Data provided by [Celenium API](https://celenium.io). Powered by Celenium API.
- **GoldRush (Covalent)** (Ronin): Transaction data fetched via GoldRush API
- **Pikespeak AI** (NEAR): NEAR Protocol transaction data via Pikespeak
- **Blockscout** (Celo, Fantom): EVM chain data via Blockscout API
- **AllThatNode** (Babylon, Polkadot, Flow): Cosmos/EVM/RPC data via AllThatNode
- **Osmosis LCD**: Native Osmosis LCD endpoint

Special thanks to these API providers for enabling 100% client-side blockchain data access.

## Links

- [Live Demo](https://osmosis-awaken-tax.pages.dev) (when deployed)
- [GitHub Repository](https://github.com/epicexcelsior/osmosis-awaken-tax)
- [Osmosis Zone](https://osmosis.zone)
- [Awaken Tax](https://awaken.tax)
- [Mintscan API](https://api.mintscan.io)
