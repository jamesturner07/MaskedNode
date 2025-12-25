# MaskedNode

MaskedNode is a privacy-first message node system built on Zama FHEVM. It lets a user store an encrypted message on
chain, keep the decryption key private, and selectively grant decryption rights to others without revealing plaintext
to the public.

## What this project does
- Creates a new node from user input, generates a random EVM address A in the client, and uses A to encrypt the
  message before it is stored on chain.
- Keeps A encrypted so only the node owner can recover it and decrypt the message.
- Lets the owner authorize another address to decrypt a specific node without exposing other nodes.
- Shows all saved nodes in the UI and supports one-click decryption for authorized users.

## Problems this solves
- On-chain storage of sensitive data without plaintext exposure.
- Sharing specific messages without sharing global access or account-level secrets.
- User-controlled privacy without relying on centralized custodians or off-chain databases.
- Clear, auditable access control for encrypted data.

## Advantages
- End-to-end privacy: ciphertext on chain, keys stay client-side.
- Fine-grained access: grant decryption per node and per address.
- Non-custodial: users keep their own keys and control permissions.
- Verifiable: all permissions and nodes are recorded on chain.
- Practical UX: one flow for create, view, decrypt, and authorize.

## Core user flow
1. Create a node by entering a message in the UI.
2. The client generates a random EVM address A, encrypts the message with A, and submits ciphertext on chain.
3. The owner decrypts A locally and then decrypts the message.
4. The owner can authorize another address to decrypt a specific node.

## Architecture and data flow
- Smart contracts (FHEVM) store encrypted messages and access-control state.
- Client-side cryptography generates and protects A.
- Zama relayer supports FHE operations for read paths.
- Frontend renders nodes, handles encryption/decryption, and manages permissions.

## Technology stack
- Smart contracts: Solidity + Hardhat + Zama FHEVM
- Frontend: React + Vite
- Wallet UX: RainbowKit
- Reads: viem
- Writes: ethers
- Package manager: npm

## Repository layout
- `contracts/`: FHE-enabled smart contracts
- `deploy/`: deployment scripts
- `tasks/`: Hardhat tasks
- `test/`: test suite
- `home/`: frontend application
- `docs/`: Zama integration docs

## Prerequisites
- Node.js 20+
- npm
- An EVM wallet with Sepolia ETH for deployment
- An Infura API key for Sepolia RPC access

## Configuration
- Create a `.env` in the repo root for deployment only.
- Required variables:
  - `PRIVATE_KEY` (deployer key, no MNEMONIC)
  - `INFURA_API_KEY`
- Optional:
  - `ETHERSCAN_API_KEY` for verification
- The frontend must not use environment variables. Configure network and addresses in source.
- Frontend ABI must match the generated ABI in `deployments/sepolia` after deployment.

## Development workflow
1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile contracts:
   ```bash
   npm run compile
   ```

3. Run tests and tasks:
   ```bash
   npm run test
   ```

4. Start a local node (for contract tests and local deploys only):
   ```bash
   npx hardhat node
   ```

5. Deploy to local node if needed:
   ```bash
   npx hardhat deploy --network localhost
   ```

6. Run the frontend:
   ```bash
   cd home
   npm install
   npm run dev
   ```

Note: the frontend should target Sepolia or another non-local RPC. Do not point the UI at localhost.

## Deployment to Sepolia
1. Ensure tests and tasks pass locally.
2. Deploy with your private key:
   ```bash
   npx hardhat deploy --network sepolia
   ```
3. Optional verification:
   ```bash
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```
4. Copy the contract ABI from `deployments/sepolia` into the frontend and update the deployed address.

## Frontend usage
- Connect a wallet.
- Create a node by submitting a message.
- View your nodes and decrypt authorized nodes.
- Grant decryption access to another address for a specific node.

## Security and privacy notes
- Encrypted payloads are stored on chain; metadata such as timestamps and sender address remain visible.
- Only authorized addresses can decrypt; losing keys means losing access.
- Decryption happens client-side; do not share private keys.
- Network reliability of the relayer can affect read operations.

## Future roadmap
- Batch permissions and multi-recipient sharing.
- Revocation history and audit views in the UI.
- Indexer for faster node discovery and search.
- Gas and ciphertext size optimizations.
- Formal security review and fuzzing.
- Optional cross-chain support once FHEVM expands.

## License
BSD-3-Clause-Clear. See `LICENSE`.
