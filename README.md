# freefall

A mobile-first onchain arcade game on **Base mainnet**. A neon ball falls endlessly while platforms rise from the bottom of the screen — steer it through the gaps. If a platform pushes the ball to the top, it's game over. Every run starts with a transaction, and scores are attested onchain to a global top-10 leaderboard.

## How it works

1. **insert coin** — connect a wallet on Base: Base Account, or any installed browser extension (MetaMask, Rabby, Coinbase Wallet, …) auto-detected via EIP-6963.
2. **play** — sends `startGame()` on the FreefallGame contract. The run begins once the transaction confirms.
3. Steer with **touch drag** (mobile) or **← → / A D** (desktop). Score = platforms passed. Speed ramps up the longer you survive.
4. On game over, **attest score** sends `attestScore(score)`, recording your result onchain. Skipping it and restarting discards the run — unattested scores don't count.
5. **top 10** — the global leaderboard, read straight from the contract.

Players pay their own gas for both transactions (two small txs per attested run). Every transaction carries this app's [ERC-8021](https://erc8021.com) builder-code attribution suffix, generated with `ox/erc8021` and appended to the calldata via viem's `dataSuffix`.

## Contract

`FreefallGame` on Base mainnet: [`0x0ab513621ecedb464d6620bdb77a88e393a141ae`](https://basescan.org/address/0x0ab513621ecedb464d6620bdb77a88e393a141ae)

- `startGame()` — opens a score session for the sender
- `attestScore(uint96)` — closes the session and records the score; updates `bestScore` and the top-10 board on a new personal best
- `getTop10()` / `bestScore(address)` / `gamesStarted(address)` — leaderboard reads

Source: [`contracts/FreefallGame.sol`](contracts/FreefallGame.sol)

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [wagmi](https://wagmi.sh) + [viem](https://viem.sh) — Base Account connector plus EIP-6963 multi-wallet discovery
- Canvas 2D rendering at 60fps — no game engine, no dependencies beyond web3

## Project structure

```
app/            Next.js app shell, providers, global styles
components/
  Game.tsx      game orchestration: canvas loop, modes, tx flows, overlays
  Leaderboard.tsx
lib/
  game.ts       pure game engine (physics, platforms, difficulty) — no DOM
  contract.ts   address + ABI
  wagmi.ts      chain/connector config
contracts/      FreefallGame.sol (verified source)
```

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The game requires a Base wallet to play; the leaderboard is readable without one.

To test on a phone, open `http://<your-LAN-IP>:3000` on the same network.

## Roadmap

- [x] ERC-8021 builder code suffix on transactions
- [x] Multi-wallet connect (Base Account, MetaMask, Rabby, …)
- [ ] Share score to X
- [ ] Vercel deployment
