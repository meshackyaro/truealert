// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title TrueAlert
/// @notice Payments for Nigerian small sellers on Electroneum: instant "Pay now"
///         invoices and "Protected" escrow orders. Sellers sign terms off-chain
///         (EIP-712); buyers submit them with payment.
/// @dev Not upgradeable. The owner can never move user funds.
contract TrueAlert is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Mode {
        PayNow,
        Protected
    }

    /// @notice What the seller signs. Buyers submit it with payment.
    struct Terms {
        bytes32 id; // random, single use across both modes
        Mode mode;
        address seller; // payee; must be the signer
        address token; // NATIVE or an allowlisted ERC-20
        uint256 amount; // exact amount in token units
        uint64 expiry; // last timestamp to pay / fund
        address buyer; // address(0) = open link, else only this wallet
        uint32 shipWindow; // Protected only, seconds
        uint32 confirmWindow; // Protected only, seconds
        address arbiter; // Protected only; address(0) = no disputes
        bytes32 ref; // hash of off-chain order details
    }

    bytes32 public constant TERMS_TYPEHASH = keccak256(
        "Terms(bytes32 id,uint8 mode,address seller,address token,uint256 amount,uint64 expiry,"
        "address buyer,uint32 shipWindow,uint32 confirmWindow,address arbiter,bytes32 ref)"
    );

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

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

    /// @notice Terms IDs already paid or funded. Shared by both modes.
    mapping(bytes32 id => bool) public used;

    event TokenAllowed(address indexed token, bool allowed);
    event FeeUpdated(uint16 feeBps, address feeRecipient);
    event InvoicePaid(
        bytes32 indexed id,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount
    );

    error FeeTooHigh(uint16 feeBps, uint16 maxFeeBps);
    error ZeroFeeRecipient();
    error WrongMode();
    error TermsExpired();
    error TermsAlreadyUsed();
    error TokenNotAllowed(address token);
    error ZeroAmount();
    error NotDesignatedBuyer();
    error InvalidSignature();
    error WrongValue(uint256 sent, uint256 expected);
    error NativeTransferFailed();

    constructor(address initialOwner) Ownable(initialOwner) EIP712("TrueAlert", "1") {
        allowedToken[NATIVE] = true;
        emit TokenAllowed(NATIVE, true);
    }

    // ---------------------------------------------------------------------
    // Signatures
    // ---------------------------------------------------------------------

    /// @notice EIP-712 digest the seller signs for `terms`. Bound to this
    ///         contract and chain, so signatures cannot be replayed elsewhere.
    function hashTerms(Terms calldata terms) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TERMS_TYPEHASH,
                    terms.id,
                    terms.mode,
                    terms.seller,
                    terms.token,
                    terms.amount,
                    terms.expiry,
                    terms.buyer,
                    terms.shipWindow,
                    terms.confirmWindow,
                    terms.arbiter,
                    terms.ref
                )
            )
        );
    }

    /// @notice True if `signature` over `terms` is from `terms.seller`.
    ///         Supports EOAs and ERC-1271 smart-contract wallets.
    function isValidSellerSignature(Terms calldata terms, bytes calldata signature)
        public
        view
        returns (bool)
    {
        return SignatureChecker.isValidSignatureNow(terms.seller, hashTerms(terms), signature);
    }

    // ---------------------------------------------------------------------
    // Pay now
    // ---------------------------------------------------------------------

    /// @notice Pay a seller-signed invoice. Funds go straight from the buyer to
    ///         the seller; this contract never holds them. No platform fee.
    /// @dev For ETN send exactly `terms.amount` as msg.value; for ERC-20 approve
    ///      this contract for `terms.amount` first and send no value.
    function payInvoice(Terms calldata terms, bytes calldata signature)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        _useTerms(terms, signature, Mode.PayNow);

        if (terms.token == NATIVE) {
            if (msg.value != terms.amount) revert WrongValue(msg.value, terms.amount);
            _sendNative(terms.seller, terms.amount);
        } else {
            if (msg.value != 0) revert WrongValue(msg.value, 0);
            IERC20(terms.token).safeTransferFrom(msg.sender, terms.seller, terms.amount);
        }

        emit InvoicePaid(terms.id, terms.seller, msg.sender, terms.token, terms.amount);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Validates terms shared by both modes and marks the ID used.
    function _useTerms(Terms calldata terms, bytes calldata signature, Mode mode) internal {
        if (terms.mode != mode) revert WrongMode();
        if (block.timestamp > terms.expiry) revert TermsExpired();
        if (used[terms.id]) revert TermsAlreadyUsed();
        if (!allowedToken[terms.token]) revert TokenNotAllowed(terms.token);
        if (terms.amount == 0) revert ZeroAmount();
        if (terms.buyer != address(0) && terms.buyer != msg.sender) revert NotDesignatedBuyer();
        if (!isValidSellerSignature(terms, signature)) revert InvalidSignature();
        used[terms.id] = true;
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
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
