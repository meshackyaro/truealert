// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Shared fixture for TrueAlert tests.
abstract contract TrueAlertBase is Test {
    TrueAlert internal ta;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    address internal buyer = makeAddr("buyer");

    uint256 internal sellerKey;
    address internal seller;

    uint256 internal constant PRICE = 10_920_000; // 10.92 USDC
    uint256 internal constant ETN_PRICE = 9_600 ether; // ~NGN 15,000 in ETN

    function setUp() public virtual {
        vm.warp(1_790_000_000); // realistic "now" (Sep 2026)
        (seller, sellerKey) = makeAddrAndKey("seller");
        ta = new TrueAlert(owner);
        usdc = new MockUSDC();
        vm.prank(owner);
        ta.setTokenAllowed(address(usdc), true);

        usdc.mint(buyer, 1_000e6);
        vm.prank(buyer);
        usdc.approve(address(ta), type(uint256).max);
        vm.deal(buyer, 100_000 ether);
    }

    function _nativePayNowTerms(bytes32 id) internal view returns (TrueAlert.Terms memory t) {
        t = _payNowTerms(id);
        t.token = address(0);
        t.amount = ETN_PRICE;
    }

    function _payNowTerms(bytes32 id) internal view returns (TrueAlert.Terms memory t) {
        t.id = id;
        t.mode = TrueAlert.Mode.PayNow;
        t.seller = seller;
        t.token = address(usdc);
        t.amount = PRICE;
        t.expiry = uint64(block.timestamp + 15 minutes);
        t.ref = keccak256("Ankara dress, NGN 15000 @ 1373");
    }

    function _sign(uint256 key, TrueAlert.Terms memory t) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ta.hashTerms(t));
        return abi.encodePacked(r, s, v);
    }
}
