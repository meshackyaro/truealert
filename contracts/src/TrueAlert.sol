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

    /// @notice Tokens accepted for new invoices and orders (NATIVE included).
    mapping(address token => bool) public allowedToken;

    event TokenAllowed(address indexed token, bool allowed);

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

    /// @notice Stop NEW invoices and orders. Releases, refunds, claims and
    ///         dispute rulings on existing orders are never paused.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
