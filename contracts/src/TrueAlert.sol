// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title TrueAlert
/// @notice Payments for Nigerian small sellers on Electroneum: instant "Pay now"
///         invoices and "Protected" escrow orders. Sellers sign terms off-chain
///         (EIP-712); buyers submit them with payment.
/// @dev Not upgradeable. The owner can never move user funds.
contract TrueAlert is Ownable2Step, Pausable {
    /// @notice Sentinel token address for native ETN.
    address public constant NATIVE = address(0);

    /// @notice Hard ceiling on the platform fee: 2%. The owner can never exceed it.
    uint16 public constant MAX_FEE_BPS = 200;
    uint16 internal constant BPS_DENOMINATOR = 10_000;

    /// @notice Tokens accepted for new invoices and orders (NATIVE included).
    mapping(address token => bool) public allowedToken;

    /// @notice Current platform fee on Protected-order seller payouts, in basis
    ///         points. Snapshotted into each order when it is funded.
    uint16 public feeBps;
    /// @notice Where platform fees are sent.
    address public feeRecipient;

    event TokenAllowed(address indexed token, bool allowed);
    event FeeUpdated(uint16 feeBps, address feeRecipient);

    error FeeTooHigh(uint16 feeBps, uint16 maxFeeBps);
    error ZeroFeeRecipient();

    constructor(address initialOwner) Ownable(initialOwner) {
        allowedToken[NATIVE] = true;
        emit TokenAllowed(NATIVE, true);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Allow or disallow a token for NEW invoices and orders.
    /// @dev Disallowing never affects orders that are already funded.
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Set the platform fee for orders funded from now on.
    /// @dev Existing orders keep the fee they were funded with.
    function setFee(uint16 newFeeBps, address newFeeRecipient) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        if (newFeeBps > 0 && newFeeRecipient == address(0)) revert ZeroFeeRecipient();
        feeBps = newFeeBps;
        feeRecipient = newFeeRecipient;
        emit FeeUpdated(newFeeBps, newFeeRecipient);
    }

    /// @notice Stop NEW invoices and orders. Releases, refunds, claims and
    ///         dispute rulings on existing orders are never paused.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
