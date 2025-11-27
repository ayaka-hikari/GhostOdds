# GhostOdds: Encrypted Dice Onchain

GhostOdds is a privacy-preserving dice game that runs fully on-chain using Zama's FHEVM. Players swap ETH for encrypted points, start a round to lock in an encrypted dice roll, and submit an encrypted guess (1 = Big, 2 = Small). The contract evaluates the guess without ever revealing the dice value, rewarding winners with 1,000 points.

## What GhostOdds Solves
- Private gameplay: balances, dice, guesses, and outcomes are stored as Zama encrypted integers, so only the player can decrypt their history.
- Fair randomness: dice values are generated in-contract with `FHE.randEuint32` and bounded to 1–6, removing any off-chain randomness trust.
- Transparent rewards: deposits convert at 1 ETH = 10,000 points, and winning guesses mint a deterministic 1,000-point reward.
- Minimal interaction surface: a single contract manages join/deposit, round lifecycle, and encrypted state sharing for both the contract and player.

## Core Flow
1. Join the game: call `joinGame` with ETH to mint encrypted points (events: `PointsPurchased`).
2. Start a round: `startRound` locks an encrypted dice value (events: `RoundStarted`).
3. Submit encrypted guess: `submitGuess` compares encrypted dice vs encrypted guess; winners earn 1,000 points (events: `GuessResolved`).
4. Decrypt privately: players decrypt balances and round data via the Zama relayer (front end handles EIP-712 signatures and relayer requests).

## Advantages
- End-to-end encryption: uses `@fhevm/solidity` types for balances, dice, guesses, and outcomes.
- On-chain enforcement: no trusted servers for randomness or settlement; only the player and contract get decrypt permissions.
- Ready for testnet: scripts target Sepolia with Infura RPC and private-key-based deployment (no mnemonics).
- Dual access patterns: contract state can be read privately (via relayer) or via view functions that return encrypted values for later decryption.

## Architecture and Stack
- Smart contracts: Hardhat + `@fhevm/hardhat-plugin`, Solidity 0.8.27, contract `contracts/GhostOdds.sol` extends `ZamaEthereumConfig`.
- Tooling: `hardhat-deploy` for scripted deployments, TypeChain for typings, gas reporter, solidity-coverage, and custom Hardhat tasks in `tasks/`.
- Tests: `test/GhostOdds.ts` runs against the FHEVM mock, decrypting ciphertexts to assert balances and round outcomes.
- Deployment script: `deploy/deploy.ts` deploys GhostOdds using the named `deployer` account pulled from `process.env.PRIVATE_KEY` and Infura RPC.
- Frontend: React + Vite + TypeScript in `app/`, RainbowKit for wallet UX, wagmi/viem for reads, ethers for writes, React Query for caching, and `@zama-fhe/relayer-sdk` for encryption/decryption. No frontend environment variables are required.
- Documentation: Zama integration guides are under `docs/zama_llm.md` and `docs/zama_doc_relayer.md`.

## Repository Layout
- `contracts/`: GhostOdds Solidity contract.
- `deploy/`: hardhat-deploy script for GhostOdds.
- `tasks/`: CLI tasks for deposits, rounds, guessing, and decryption.
- `test/`: contract tests using the FHEVM mock.
- `deployments/`: generated deployment artifacts and ABI (copy this ABI into the frontend).
- `app/`: React frontend (uses CSS, no Tailwind, no frontend env vars).

## Prerequisites
- Node.js 20+
- npm
- Environment variables in a root `.env` file (loaded via `import * as dotenv` in `hardhat.config.ts`):
  - `INFURA_API_KEY` for Sepolia RPC
  - `PRIVATE_KEY` for deployments (use a hex private key with `0x` prefix; do not use a mnemonic)
  - `ETHERSCAN_API_KEY` (optional, for verification)

## Contract Setup and Scripts
1. Install dependencies
   ```bash
   npm install
   ```
2. Compile and generate types
   ```bash
   npm run compile
   ```
3. Run tests (uses the FHEVM mock; will skip if the mock is unavailable)
   ```bash
   npm run test
   ```
4. Local dev chain and deploy
   ```bash
   npm run chain              # start Hardhat node
   npm run deploy:localhost   # deploy GhostOdds locally
   ```
5. Deploy to Sepolia (requires `INFURA_API_KEY` and `PRIVATE_KEY`)
   ```bash
   npm run deploy:sepolia
   ```
6. Verify on Sepolia (optional, requires `ETHERSCAN_API_KEY`)
   ```bash
   npm run verify:sepolia -- <DEPLOYED_CONTRACT_ADDRESS>
   ```

## Hardhat Tasks (CLI)
- Print deployed address: `npx hardhat task:game-address`
- Join with ETH: `npx hardhat task:join-game --eth 0.25`
- Start a round: `npx hardhat task:start-round`
- Submit encrypted guess: `npx hardhat task:guess --value 1` (1 = Big, 2 = Small; uses `fhevm.initializeCLIApi`)
- Decrypt balance: `npx hardhat task:decrypt-balance`
- Decrypt round data: `npx hardhat task:decrypt-round`

## Frontend Setup (`app/`)
1. Install dependencies
   ```bash
   cd app
   npm install
   ```
2. Configure contract address and ABI
   - Update `app/src/config/contracts.ts` with the deployed Sepolia address.
   - Replace the ABI in the same file with the latest from `deployments/sepolia/GhostOdds.json` (must use the generated contract ABI).
3. Run the UI
   ```bash
   npm run dev      # Vite dev server
   npm run build    # production build
   npm run preview  # preview the built app
   ```
4. Gameplay in the UI
   - Connect with RainbowKit (Sepolia).
   - Deposit ETH once to mint encrypted points (1 ETH = 10,000 points).
   - Start an encrypted round, choose Big (1) or Small (2); the contract resolves privately and awards 1,000 points on a win.
   - Use "Decrypt latest data" to privately view balances, dice rolls, guesses, and outcomes through the Zama relayer.

Notes: the frontend reads with wagmi/viem, writes with ethers, avoids local storage, and keeps network selection on Sepolia (no localhost chain usage).

## Future Plans
- Add multiple bet sizes and reward tiers while preserving encrypted logic.
- Surface richer history (round streaks, win rates) with client-side decryption only.
- Integrate automated CI for tests and coverage on push.
- Expand relayer configuration options (alternate gateways, retries, monitoring).
- Formal audits and additional invariants (e.g., fuzz tests on encrypted flows).

## References
- FHE contract guide: `docs/zama_llm.md`
- Frontend relayer guide: `docs/zama_doc_relayer.md`
- Deployment script: `deploy/deploy.ts`
- Core contract: `contracts/GhostOdds.sol`
