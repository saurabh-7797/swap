# 🚀 GorbChain AMM (Automated Market Maker)

A complete Automated Market Maker (AMM) implementation for GorbChain, featuring token creation, pool initialization, liquidity provision, swapping, and liquidity removal with comprehensive balance tracking and fee calculations.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Scripts](#scripts)
- [Smart Contract](#smart-contract)
- [Transaction History](#transaction-history)
- [Technical Details](#technical-details)

## 🎯 Overview

This project implements a fully functional AMM on GorbChain with the following capabilities:
- **Token Creation**: Create custom tokens using GorbChain's SPL Token-2022 program
- **Pool Management**: Initialize liquidity pools with custom token pairs
- **Liquidity Operations**: Add and remove liquidity with detailed balance tracking
- **Swapping**: Bidirectional token swaps with 0.3% fee calculation
- **Comprehensive Tracking**: Real-time balance monitoring and transaction verification

## ✨ Features

### 🔧 Core AMM Functions
- ✅ **InitPool**: Initialize new liquidity pools with custom token pairs
- ✅ **AddLiquidity**: Provide liquidity and receive LP tokens
- ✅ **Swap**: Bidirectional token swaps (A→B and B→A)
- ✅ **RemoveLiquidity**: Burn LP tokens and receive underlying tokens

### 📊 Enhanced Tracking
- ✅ **Real-time Balance Monitoring**: Before/after balance tracking for all operations
- ✅ **Fee Calculations**: 0.3% swap fees with detailed breakdown
- ✅ **Exchange Rate Display**: Real-time exchange rates
- ✅ **Transaction Verification**: GorbScan links for all transactions
- ✅ **Comprehensive Logging**: Detailed operation logs and error handling

### 🏗️ Technical Features
- ✅ **GorbChain Integration**: Custom SPL Token program support
- ✅ **PDA Management**: Program Derived Address handling
- ✅ **Borsh Serialization**: Proper instruction data formatting
- ✅ **Error Handling**: Comprehensive error reporting and debugging

## 🏛️ Architecture

### Smart Contract (`src/lib.rs`)
- **Program ID**: `2J3J9tTDLeC7jHpuawS8J98wMZeANNrzvaTAkU4SFycX`
- **Custom SPL Integration**: Uses GorbChain's SPL Token program (`G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6`)
- **Instruction Set**:
  - `InitPool`: Initialize new liquidity pools
  - `AddLiquidity`: Add liquidity to existing pools
  - `RemoveLiquidity`: Remove liquidity from pools
  - `Swap`: Execute token swaps

### Token Configuration
- **Token A (Plasma)**: `4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P`
- **Token B (Plasma2)**: `AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH`
- **LP Mint**: `Bsb26ojJdPGHQ97HokmZAMuwDkK5RRVwtyW1VBUJrQNy`
- **Pool Address**: `ANvSTQM6XSwBXARcdekMSHp6dZhbToVMTE9y6SQkUbds`

## 🛠️ Installation

### Prerequisites
- Node.js (v16 or higher)
- Rust and Cargo
- Solana CLI tools
- GorbChain RPC access

### Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd cargo_swap

# Install Node.js dependencies
npm install

# Install Rust dependencies
cargo build

# Configure Solana CLI for GorbChain
solana config set --url https://rpc.gorbchain.xyz
```

### Dependencies
```json
{
  "@solana/web3.js": "^1.87.0",
  "@solana/spl-token": "^0.3.9"
}
```

## 🚀 Usage

### 1. Create Tokens
```bash
node create-two-tokens-fresh.js
```

### 2. Initialize Pool
```bash
node init-pool.js
```

### 3. Add Liquidity
```bash
node add-liquidity.js
```

### 4. Perform Swaps
```bash
# Single direction swap
node swap.js

# Bidirectional swaps with detailed testing
node test-swaps-both-directions.js
```

### 5. Remove Liquidity
```bash
node remove-liquidity.js
```

## 📜 Scripts

### Core AMM Scripts

#### `create-two-tokens-fresh.js`
Creates two custom tokens on GorbChain with Token-2022 extensions:
- **Plasma Token**: 9 decimals, metadata pointer enabled
- **Plasma2 Token**: 9 decimals, metadata pointer enabled

#### `init-pool.js`
Initializes a new liquidity pool:
- Creates LP mint with pool PDA as authority
- Sets up vault accounts for token storage
- Provides initial liquidity (1,000,000,000 tokens each)

#### `add-liquidity.js`
Adds liquidity to existing pool:
- Tracks balances before/after operation
- Calculates LP tokens received
- Maintains 1:1 liquidity ratio

#### `swap.js`
Performs single-direction token swaps:
- Supports both A→B and B→A directions
- Calculates 0.3% fees
- Shows exchange rates and balance changes

#### `remove-liquidity.js`
Removes liquidity from pool:
- Burns LP tokens
- Returns underlying tokens
- Calculates removal percentage

#### `test-swaps-both-directions.js`
Comprehensive swap testing:
- Tests both swap directions
- Detailed fee calculations
- Balance tracking and reporting

## 🔗 Transaction History

### Successful Transactions

#### InitPool
- **Signature**: `RsSN1AXMfSJdDA3DNYXx4xrz5cVX7SM5kakr5xeQwhWJYskDR161YMjyXc6aEJVREsaGmc5EthL8c4f8YiDFHzG`
- **GorbScan**: https://gorbscan.com/tx/RsSN1AXMfSJdDA3DNYXx4xrz5cVX7SM5kakr5xeQwhWJYskDR161YMjyXc6aEJVREsaGmc5EthL8c4f8YiDFHzG

#### AddLiquidity
- **Signature**: `2qm5zGh7J9fZRgth3fgQZE6RjxhJ2inZKA7VhB9jA6wt49ToJ4qkgsT3qU3uhXRgNyiRRMVrgXFFdweLpCzReyJf`
- **GorbScan**: https://gorbscan.com/tx/2qm5zGh7J9fZRgth3fgQZE6RjxhJ2inZKA7VhB9jA6wt49ToJ4qkgsT3qU3uhXRgNyiRRMVrgXFFdweLpCzReyJf

#### Swap (A→B)
- **Signature**: `5RkrhoQETBG2TbewypuNkytZjuq9YJsGS3q7J5vwTBzJ1EYEHuVdarSNYVxBhGWMbULHh5Jqw9fPEQ77JBTdAyFF`
- **GorbScan**: https://gorbscan.com/tx/5RkrhoQETBG2TbewypuNkytZjuq9YJsGS3q7J5vwTBzJ1EYEHuVdarSNYVxBhGWMbULHh5Jqw9fPEQ77JBTdAyFF

#### RemoveLiquidity
- **Signature**: `5AzvDEVxmouka3Af41xhWz1DBYmjJy9T5KwnuVVnZnHGJ8AXpRAk5TQdXsi29R3hsTyFjFew4zCdd1np9QUiQBSp`
- **GorbScan**: https://gorbscan.com/tx/5AzvDEVxmouka3Af41xhWz1DBYmjJy9T5KwnuVVnZnHGJ8AXpRAk5TQdXsi29R3hsTyFjFew4zCdd1np9QUiQBSp

## 🔧 Technical Details

### Program IDs
- **AMM Program**: `2J3J9tTDLeC7jHpuawS8J98wMZeANNrzvaTAkU4SFycX`
- **SPL Token Program**: `G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6`
- **ATA Program**: `GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm`

### Network Configuration
- **RPC Endpoint**: `https://rpc.gorbchain.xyz`
- **WS Endpoint**: `wss://rpc.gorbchain.xyz/ws/`
- **Commitment**: `confirmed`

### Fee Structure
- **Swap Fee**: 0.3% (30 basis points)
- **Liquidity Fee**: 0% (no additional fees for liquidity operations)

### Instruction Discriminators
- **InitPool**: `0`
- **AddLiquidity**: `1`
- **RemoveLiquidity**: `2`
- **Swap**: `3`

## 📈 Performance Metrics

### Pool Statistics
- **Total Value Locked**: Variable based on liquidity provided
- **Swap Volume**: Tracked per transaction
- **Fee Revenue**: 0.3% of swap volume
- **Liquidity Provider Rewards**: Proportional to LP token holdings

### Gas Optimization
- **Transaction Size**: Optimized for minimal gas consumption
- **Instruction Efficiency**: Single transaction for complex operations
- **Account Reuse**: Efficient account management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- GorbChain team for providing the custom SPL Token implementation
- Solana Labs for the foundational blockchain technology
- The Solana community for development tools and documentation

## 📞 Support

For support and questions:
- Create an issue in this repository
- Contact the development team
- Check the GorbChain documentation

---

**Built with ❤️ for the GorbChain ecosystem** 