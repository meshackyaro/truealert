// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertDisputeTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function setUp() public override {
        super.setUp();
        _fund(_protectedTerms(ID));
        vm.prank(seller);
        ta.markShipped(ID);
    }

    function test_Dispute() public {
        uint64 expected = uint64(block.timestamp + 14 days);
        vm.expectEmit(address(ta));
        emit TrueAlert.OrderDisputed(ID, arbiter, expected);
        vm.prank(buyer);
        ta.dispute(ID);

        TrueAlert.Order memory o = _order(ID);
        assertEq(uint8(o.status), uint8(TrueAlert.Status.Disputed));
        assertEq(o.disputeDeadline, expected);
    }

    function test_Dispute_AfterExtension() public {
        vm.prank(buyer);
        ta.extend(ID, 24 hours);
        vm.warp(_order(ID).confirmDeadline); // within the extended window
        vm.prank(buyer);
        ta.dispute(ID);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Disputed));
    }

    function test_Dispute_FreezesSellerAndBuyerActions() public {
        vm.prank(buyer);
        ta.dispute(ID);
        vm.warp(block.timestamp + 30 days);

        bytes memory frozen =
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Disputed);
        vm.expectRevert(frozen);
        vm.prank(seller);
        ta.claim(ID);

        vm.expectRevert(frozen);
        vm.prank(seller);
        ta.cancel(ID);

        vm.expectRevert(frozen);
        vm.prank(buyer);
        ta.confirmReceived(ID);

        vm.expectRevert(frozen);
        vm.prank(buyer);
        ta.dispute(ID);

        assertEq(usdc.balanceOf(address(ta)), PRICE, "funds stay locked");
    }

    function test_RevertWhen_NoArbiter() public {
        bytes32 id2 = keccak256("order-2");
        TrueAlert.Terms memory t = _protectedTerms(id2);
        t.arbiter = address(0);
        _fund(t);
        vm.prank(seller);
        ta.markShipped(id2);
        vm.expectRevert(TrueAlert.NoArbiter.selector);
        vm.prank(buyer);
        ta.dispute(id2);
    }

    function test_RevertWhen_AfterConfirmDeadline() public {
        vm.warp(_order(ID).confirmDeadline + 1);
        vm.expectRevert(TrueAlert.DeadlinePassed.selector);
        vm.prank(buyer);
        ta.dispute(ID);
    }

    function test_RevertWhen_NotShipped() public {
        bytes32 id2 = keccak256("order-2");
        _fund(_protectedTerms(id2));
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Funded)
        );
        vm.prank(buyer);
        ta.dispute(id2);
    }

    function test_RevertWhen_NotBuyer() public {
        vm.expectRevert(TrueAlert.NotBuyer.selector);
        vm.prank(seller);
        ta.dispute(ID);
    }
}
