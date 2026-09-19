// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

/// @dev Seller wallet (ERC-1271) that, when paid in ETN, tries to also refund
///      the buyer via `cancel` — which would drain other orders' escrow.
contract MaliciousSeller {
    TrueAlert internal immutable ta;
    bytes32 public target;
    bool public reentered;
    bool public reentrySucceeded;

    constructor(TrueAlert ta_) {
        ta = ta_;
    }

    function setTarget(bytes32 id) external {
        target = id;
    }

    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0x1626ba7e;
    }

    function markShipped(bytes32 id) external {
        ta.markShipped(id);
    }

    function claim(bytes32 id) external {
        ta.claim(id);
    }

    receive() external payable {
        if (reentered) return;
        reentered = true;
        try ta.cancel(target) {
            reentrySucceeded = true;
        } catch {}
    }
}

contract TrueAlertReentrancyTest is TrueAlertBase {
    MaliciousSeller internal evil;

    function setUp() public override {
        super.setUp();
        evil = new MaliciousSeller(ta);
    }

    function test_ClaimCannotReenterIntoCancel() public {
        // An honest order keeps ETN in escrow that the attacker would love to steal.
        TrueAlert.Terms memory honest = _protectedTerms(keccak256("honest"));
        honest.token = address(0);
        honest.amount = ETN_PRICE;
        _fund(honest);

        bytes32 id = keccak256("evil-order");
        TrueAlert.Terms memory t = _protectedTerms(id);
        t.seller = address(evil);
        t.token = address(0);
        t.amount = ETN_PRICE;
        vm.prank(buyer);
        ta.fund{value: ETN_PRICE}(t, hex"01");

        evil.setTarget(id);
        evil.markShipped(id);
        vm.warp(ta.getOrder(id).confirmDeadline + 1);
        evil.claim(id);

        assertTrue(evil.reentered(), "attack was attempted");
        assertFalse(evil.reentrySucceeded(), "re-entrant cancel blocked");
        assertEq(address(evil).balance, ETN_PRICE, "paid exactly once");
        assertEq(address(ta).balance, ETN_PRICE, "honest escrow untouched");
        assertEq(uint8(ta.getOrder(id).status), uint8(TrueAlert.Status.Released));
    }

    function test_PayNowCannotReenter() public {
        bytes32 id = keccak256("evil-invoice");
        TrueAlert.Terms memory t = _nativePayNowTerms(id);
        t.seller = address(evil);
        evil.setTarget(id);

        vm.prank(buyer);
        ta.payInvoice{value: ETN_PRICE}(t, hex"01");

        assertTrue(evil.reentered());
        assertFalse(evil.reentrySucceeded());
        assertEq(address(evil).balance, ETN_PRICE);
        assertEq(address(ta).balance, 0);
    }
}
