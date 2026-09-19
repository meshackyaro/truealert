// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrueAlert} from "../../src/TrueAlert.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";

/// @notice Drives random sequences of every TrueAlert action for invariant tests.
contract TrueAlertHandler is Test {
    TrueAlert public immutable ta;
    MockUSDC public immutable usdc;
    address public immutable owner;

    uint256 internal immutable sellerKey;
    address public immutable seller;
    address public immutable arbiter = makeAddr("inv-arbiter");
    address public immutable treasury = makeAddr("inv-treasury");
    address[3] internal buyers;

    bytes32[] public ids;
    uint256 internal nonce;

    /// @notice Successful transitions, to prove the fuzzer reaches every state.
    mapping(bytes32 action => uint256) public ghostSuccess;

    constructor(TrueAlert ta_, MockUSDC usdc_, address owner_) {
        ta = ta_;
        usdc = usdc_;
        owner = owner_;
        (seller, sellerKey) = makeAddrAndKey("inv-seller");
        for (uint256 i; i < 3; ++i) {
            buyers[i] = makeAddr(string.concat("inv-buyer-", vm.toString(i)));
            vm.deal(buyers[i], 1e30);
            vm.prank(buyers[i]);
            usdc.approve(address(ta), type(uint256).max);
        }
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    // --- actions ---------------------------------------------------------

    function fund(uint256 amount, uint256 buyerSeed, bool native, bool withArbiter) external {
        amount = bound(amount, 1, native ? 1e24 : 10_000e6);
        address b = buyers[buyerSeed % 3];
        bytes32 id = keccak256(abi.encode("inv", nonce++));

        TrueAlert.Terms memory t;
        t.id = id;
        t.mode = TrueAlert.Mode.Protected;
        t.seller = seller;
        t.token = native ? address(0) : address(usdc);
        t.amount = amount;
        t.expiry = uint64(block.timestamp + 1 days);
        t.shipWindow = 1 days;
        t.confirmWindow = 1 days;
        t.arbiter = withArbiter ? arbiter : address(0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerKey, ta.hashTerms(t));
        bytes memory sig = abi.encodePacked(r, s, v);

        if (!native) usdc.mint(b, amount);
        vm.prank(b);
        if (native) ta.fund{value: amount}(t, sig);
        else ta.fund(t, sig);
        ids.push(id);
        ghostSuccess["fund"]++;
    }

    function ship(uint256 idx) external {
        bytes32 id = _pick(idx);
        vm.prank(seller);
        try ta.markShipped(id) {
            ghostSuccess["ship"]++;
        } catch {}
    }

    function confirm(uint256 idx) external {
        bytes32 id = _pick(idx);
        vm.prank(ta.getOrder(id).buyer);
        try ta.confirmReceived(id) {
            ghostSuccess["confirm"]++;
        } catch {}
    }

    function claim(uint256 idx) external {
        bytes32 id = _pick(idx);
        vm.prank(seller);
        try ta.claim(id) {
            ghostSuccess["claim"]++;
        } catch {}
    }

    function reclaim(uint256 idx) external {
        bytes32 id = _pick(idx);
        vm.prank(ta.getOrder(id).buyer);
        try ta.reclaim(id) {
            ghostSuccess["reclaim"]++;
        } catch {}
    }

    function cancel(uint256 idx) external {
        bytes32 id = _pick(idx);
        vm.prank(seller);
        try ta.cancel(id) {
            ghostSuccess["cancel"]++;
        } catch {}
    }

    function extend(uint256 idx, uint32 secs) external {
        bytes32 id = _pick(idx);
        vm.prank(ta.getOrder(id).buyer);
        try ta.extend(id, uint32(bound(secs, 1, 48 hours))) {
            ghostSuccess["extend"]++;
        } catch {}
    }

    function dispute(uint256 idx) external {
        bytes32 id = _pick(idx);
        vm.prank(ta.getOrder(id).buyer);
        try ta.dispute(id) {
            ghostSuccess["dispute"]++;
        } catch {}
    }

    function resolve(uint256 idx, uint256 share) external {
        bytes32 id = _pick(idx);
        share = bound(share, 0, ta.getOrder(id).amount);
        vm.prank(arbiter);
        try ta.resolve(id, share) {
            ghostSuccess["resolve"]++;
        } catch {}
    }

    function resolveTimeout(uint256 idx) external {
        bytes32 id = _pick(idx);
        try ta.resolveTimeout(id) {
            ghostSuccess["resolveTimeout"]++;
        } catch {}
    }

    function setFee(uint16 bps) external {
        vm.prank(owner);
        ta.setFee(uint16(bound(bps, 0, 200)), treasury);
    }

    function warp(uint256 secs) external {
        // Short hops so actions land inside the 1-day windows; many hops
        // in a sequence still reach the 14-day arbiter timeout.
        vm.warp(block.timestamp + bound(secs, 1, 36 hours));
    }

    /// @dev Mostly picks among the 3 newest orders (likely still open, so
    ///      deeper transitions get exercised); sometimes any order.
    function _pick(uint256 idx) internal view returns (bytes32) {
        uint256 n = ids.length;
        if (n == 0) return bytes32(0);
        if (idx % 4 == 0) return ids[(idx / 4) % n];
        uint256 recent = n < 3 ? n : 3;
        return ids[n - 1 - (idx / 4) % recent];
    }
}
