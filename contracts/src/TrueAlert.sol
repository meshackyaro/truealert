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

    enum Status {
        None,
        Funded,
        Shipped,
        Disputed,
        Released,
        Refunded,
        Resolved
    }

    /// @notice A funded Protected order. Field order packs into 5 slots.
    struct Order {
        address seller;
        uint64 shipDeadline;
        address buyer;
        uint64 confirmDeadline; // set when shipped
        address token;
        uint64 disputeDeadline; // set when disputed
        address arbiter;
        uint32 confirmWindow;
        uint16 feeBps; // snapshotted at funding
        Status status;
        bool extended;
        uint256 amount;
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

    /// @notice Bounds on seller-chosen windows. The 12h confirm minimum stops a
    ///         seller from marking shipped and claiming before the buyer can react.
    uint32 public constant MIN_SHIP_WINDOW = 1 hours;
    uint32 public constant MAX_SHIP_WINDOW = 14 days;
    uint32 public constant MIN_CONFIRM_WINDOW = 12 hours;
    uint32 public constant MAX_CONFIRM_WINDOW = 14 days;
    /// @notice Longest one-time extension a buyer may add to the confirm deadline.
    uint32 public constant MAX_EXTENSION = 48 hours;
    /// @notice How long an arbiter has to rule before the buyer is refunded.
    uint32 public constant ARBITER_WINDOW = 14 days;

    /// @notice Tokens accepted for new invoices and orders (NATIVE included).
    mapping(address token => bool) public allowedToken;

    /// @notice Current platform fee on Protected-order seller payouts, in basis
    ///         points. Snapshotted into each order when it is funded.
    uint16 public feeBps;
    /// @notice Where platform fees are sent.
    address public feeRecipient;

    /// @notice Terms IDs already paid or funded. Shared by both modes.
    mapping(bytes32 id => bool) public used;

    mapping(bytes32 id => Order) internal _orders;

    event TokenAllowed(address indexed token, bool allowed);
    event FeeUpdated(uint16 feeBps, address feeRecipient);
    event InvoicePaid(
        bytes32 indexed id,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount
    );
    event OrderFunded(
        bytes32 indexed id,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount,
        uint64 shipDeadline,
        address arbiter,
        uint16 feeBps
    );
    event OrderShipped(bytes32 indexed id, uint64 confirmDeadline);
    event OrderReleased(bytes32 indexed id, uint256 sellerAmount, uint256 fee);
    event OrderRefunded(bytes32 indexed id, uint256 amount);
    event OrderExtended(bytes32 indexed id, uint64 confirmDeadline);
    event OrderDisputed(bytes32 indexed id, address indexed arbiter, uint64 disputeDeadline);
    event OrderResolved(
        bytes32 indexed id, uint256 sellerAmount, uint256 buyerAmount, uint256 fee, bool timedOut
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
    error SellerCannotBuy();
    error InvalidWindows();
    error InvalidArbiter();
    error NotSeller();
    error NotBuyer();
    error InvalidStatus(Status current);
    error DeadlinePassed();
    error DeadlineNotReached();
    error AlreadyExtended();
    error InvalidExtension();
    error NoArbiter();
    error NotArbiter();
    error InvalidShare();

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
    // Protected (escrow)
    // ---------------------------------------------------------------------

    /// @notice Fund a seller-signed Protected order. Funds are locked here until
    ///         released to the seller or refunded to the buyer. The caller
    ///         becomes the order's buyer.
    /// @dev Snapshots the current platform fee into the order.
    function fund(Terms calldata terms, bytes calldata signature)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        _useTerms(terms, signature, Mode.Protected);
        if (msg.sender == terms.seller) revert SellerCannotBuy();
        if (
            terms.shipWindow < MIN_SHIP_WINDOW || terms.shipWindow > MAX_SHIP_WINDOW
                || terms.confirmWindow < MIN_CONFIRM_WINDOW
                || terms.confirmWindow > MAX_CONFIRM_WINDOW
        ) revert InvalidWindows();
        if (
            terms.arbiter != address(0)
                && (terms.arbiter == terms.seller || terms.arbiter == msg.sender)
        ) revert InvalidArbiter();

        uint64 shipDeadline = uint64(block.timestamp) + terms.shipWindow;
        uint16 orderFeeBps = feeBps;
        _orders[terms.id] = Order({
            seller: terms.seller,
            shipDeadline: shipDeadline,
            buyer: msg.sender,
            confirmDeadline: 0,
            token: terms.token,
            disputeDeadline: 0,
            arbiter: terms.arbiter,
            confirmWindow: terms.confirmWindow,
            feeBps: orderFeeBps,
            status: Status.Funded,
            extended: false,
            amount: terms.amount
        });

        if (terms.token == NATIVE) {
            if (msg.value != terms.amount) revert WrongValue(msg.value, terms.amount);
        } else {
            if (msg.value != 0) revert WrongValue(msg.value, 0);
            IERC20(terms.token).safeTransferFrom(msg.sender, address(this), terms.amount);
        }

        emit OrderFunded(
            terms.id,
            terms.seller,
            msg.sender,
            terms.token,
            terms.amount,
            shipDeadline,
            terms.arbiter,
            orderFeeBps
        );
    }

    /// @notice Seller confirms dispatch. Starts the buyer's confirm window.
    function markShipped(bytes32 id) external {
        Order storage o = _orders[id];
        if (msg.sender != o.seller) revert NotSeller();
        if (o.status != Status.Funded) revert InvalidStatus(o.status);
        if (block.timestamp > o.shipDeadline) revert DeadlinePassed();

        uint64 confirmDeadline = uint64(block.timestamp) + o.confirmWindow;
        o.confirmDeadline = confirmDeadline;
        o.status = Status.Shipped;
        emit OrderShipped(id, confirmDeadline);
    }

    /// @notice Buyer confirms they received the item; pays the seller now.
    ///         Allowed before shipping too (e.g. collected in person).
    function confirmReceived(bytes32 id) external nonReentrant {
        Order storage o = _orders[id];
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.status != Status.Funded && o.status != Status.Shipped) {
            revert InvalidStatus(o.status);
        }
        _release(id, o);
    }

    /// @notice Seller collects after the buyer stayed silent past the confirm
    ///         deadline. Not possible while a dispute is open.
    function claim(bytes32 id) external nonReentrant {
        Order storage o = _orders[id];
        if (msg.sender != o.seller) revert NotSeller();
        if (o.status != Status.Shipped) revert InvalidStatus(o.status);
        if (block.timestamp <= o.confirmDeadline) revert DeadlineNotReached();
        _release(id, o);
    }

    /// @notice Buyer takes their money back when the seller never shipped
    ///         before the ship deadline. Always a full refund, no fee.
    function reclaim(bytes32 id) external nonReentrant {
        Order storage o = _orders[id];
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.status != Status.Funded) revert InvalidStatus(o.status);
        if (block.timestamp <= o.shipDeadline) revert DeadlineNotReached();
        _refund(id, o);
    }

    /// @notice Seller refunds the buyer in full at any point before release,
    ///         e.g. out of stock or an unexpected payer on an open link.
    ///         Not possible while a dispute is open; the arbiter decides then.
    function cancel(bytes32 id) external nonReentrant {
        Order storage o = _orders[id];
        if (msg.sender != o.seller) revert NotSeller();
        if (o.status != Status.Funded && o.status != Status.Shipped) {
            revert InvalidStatus(o.status);
        }
        _refund(id, o);
    }

    /// @notice Buyer pushes the confirm deadline out once ("rider hasn't
    ///         arrived yet"), by up to MAX_EXTENSION.
    function extend(bytes32 id, uint32 extraSeconds) external {
        Order storage o = _orders[id];
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.status != Status.Shipped) revert InvalidStatus(o.status);
        if (o.extended) revert AlreadyExtended();
        if (block.timestamp > o.confirmDeadline) revert DeadlinePassed();
        if (extraSeconds == 0 || extraSeconds > MAX_EXTENSION) revert InvalidExtension();

        o.extended = true;
        uint64 confirmDeadline = o.confirmDeadline + extraSeconds;
        o.confirmDeadline = confirmDeadline;
        emit OrderExtended(id, confirmDeadline);
    }

    /// @notice Buyer disputes a shipped order (e.g. nothing arrived, wrong
    ///         item). Freezes claim, confirm and cancel; the arbiter named in
    ///         the signed terms has ARBITER_WINDOW to rule. One per order.
    function dispute(bytes32 id) external {
        Order storage o = _orders[id];
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.status != Status.Shipped) revert InvalidStatus(o.status);
        if (o.arbiter == address(0)) revert NoArbiter();
        if (block.timestamp > o.confirmDeadline) revert DeadlinePassed();

        uint64 disputeDeadline = uint64(block.timestamp) + ARBITER_WINDOW;
        o.disputeDeadline = disputeDeadline;
        o.status = Status.Disputed;
        emit OrderDisputed(id, o.arbiter, disputeDeadline);
    }

    /// @notice Arbiter rules on a disputed order: `sellerShare` goes to the
    ///         seller (less the fee), the rest back to the buyer. Funds can
    ///         only ever go to this order's buyer and seller.
    function resolve(bytes32 id, uint256 sellerShare) external nonReentrant {
        Order storage o = _orders[id];
        if (msg.sender != o.arbiter || o.arbiter == address(0)) revert NotArbiter();
        if (o.status != Status.Disputed) revert InvalidStatus(o.status);
        if (block.timestamp > o.disputeDeadline) revert DeadlinePassed();
        if (sellerShare > o.amount) revert InvalidShare();

        o.status = Status.Resolved;
        uint256 fee = _feeOn(sellerShare, o.feeBps);
        uint256 sellerAmount = sellerShare - fee;
        uint256 buyerAmount = o.amount - sellerShare;
        _payout(o.token, o.seller, sellerAmount);
        _payout(o.token, feeRecipient, fee);
        _payout(o.token, o.buyer, buyerAmount);
        emit OrderResolved(id, sellerAmount, buyerAmount, fee, false);
    }

    /// @notice Full state of a Protected order (status None if it doesn't exist).
    function getOrder(bytes32 id) external view returns (Order memory) {
        return _orders[id];
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

    /// @dev Pays the whole order to the seller, less the snapshotted fee.
    function _release(bytes32 id, Order storage o) internal {
        o.status = Status.Released;
        uint256 fee = _feeOn(o.amount, o.feeBps);
        uint256 sellerAmount = o.amount - fee;
        _payout(o.token, o.seller, sellerAmount);
        _payout(o.token, feeRecipient, fee);
        emit OrderReleased(id, sellerAmount, fee);
    }

    /// @dev Returns the whole order to the buyer. Refunds never pay a fee.
    function _refund(bytes32 id, Order storage o) internal {
        o.status = Status.Refunded;
        _payout(o.token, o.buyer, o.amount);
        emit OrderRefunded(id, o.amount);
    }

    /// @dev Fee is waived if no recipient is set, so a later `setFee(0, 0)`
    ///      can never strand funds in orders funded under a non-zero fee.
    function _feeOn(uint256 amount, uint16 bps) internal view returns (uint256) {
        if (feeRecipient == address(0)) return 0;
        return amount * bps / BPS_DENOMINATOR;
    }

    /// @dev Transfers out of escrow. Zero amounts are skipped.
    function _payout(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == NATIVE) _sendNative(to, amount);
        else IERC20(token).safeTransfer(to, amount);
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
