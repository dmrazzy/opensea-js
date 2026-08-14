# sdk — Agent Conventions

TypeScript SDK for buying, selling, and managing NFTs and tokens on OpenSea. Supports ethers and viem providers.

## Quick commands

```bash
cd packages/sdk
pnpm run build
pnpm run test
pnpm run test:integration  # requires OPENSEA_API_KEY
pnpm run check-types
pnpm run lint
```

## Responsibilities

- Provide `OpenSeaSDK` (ethers) and `OpenSeaViemSDK` (viem) entry points.
- Provide the Stream API client at the `@opensea/sdk/stream` subpath.
- Camelize API responses and expose typed helpers for orders, fulfillment, assets, and wallet auth.
- Keep the `Chain` enum in sync with `ChainIdentifier` from `@opensea/api-types`.

## Rules

1. **Never hand-roll API request/response types**. Import from `@opensea/api-types` (or re-export through `src/api/types.ts`) using canonical schema names.
2. **Chain enum sync is compile-time enforced**. Adding a `ChainIdentifier` without a matching `Chain` value or payment-token case fails `pnpm check-types`. Update `scripts/chain-data.json` at the monorepo root and run `pnpm sync-chains` when adding chains.
3. **Dual provider support**. Changes to `BaseOpenSeaSDK` affect both ethers and viem paths; update both provider adapters if provider-specific logic changes.
4. **OAuth token contract**. `OpenSeaOAuth` requests `offline_access`; refresh responses may omit rotation — keep the previous refresh token. The top-level `wallet` JWT claim is wallet identity; `sub` is an account id.
5. **No secret leakage**. API keys live in `OpenSeaAPIConfig.apiKey`; never log them.
6. **Stream stays on its own subpath**. `EventType`, `Trait`, `TraitOfferEvent`,
   and `CollectionOfferEvent` exist in both surfaces with different shapes, so
   `src/stream/` must never be re-exported from `src/index.ts`.
7. **The stream transport is internal**. `src/stream/transport/` is not exported
   from `src/stream/index.ts`. Stream API v2 will not speak Phoenix Channels, so
   the interface must stay free to change without a breaking release. Client code
   talks to `StreamTransport`, never to `PhoenixChannelsTransport` directly.
8. **No dependency for the stream client**. `@opensea/sdk/stream` resolves to six
   local files and nothing else. Verify with a require-graph walk before adding
   any import there.

## Conventions

- CommonJS (`"type": "commonjs"`) for broad consumer support.
- Node 22+ is the floor. The stream client relies on a global `WebSocket`.
- `viem` is an optional peer dependency; main entry uses ethers.
- Prefer `string` for decimal `Amount` values.
