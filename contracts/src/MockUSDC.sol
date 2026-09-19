// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Testnet-only stand-in for USDC. Electroneum testnet has no canonical
///         stablecoin, so TrueAlert deploys its own. Uses 6 decimals to match the
///         Hyperlane-bridged USDC on mainnet. Anyone can mint, capped per call.
contract MockUSDC is ERC20 {
    /// @notice Largest amount a single `mint` call may create (10,000 USDC).
    uint256 public constant MAX_MINT = 10_000e6;

    error MintTooLarge(uint256 requested, uint256 max);

    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint test tokens to `to`. Open to anyone; testnet only.
    function mint(address to, uint256 amount) external {
        if (amount > MAX_MINT) revert MintTooLarge(amount, MAX_MINT);
        _mint(to, amount);
    }
}
