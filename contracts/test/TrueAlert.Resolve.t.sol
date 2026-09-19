// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertResolveTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");
    uint256 internal buyerStart;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        ta.setFee(100, treasury); // 1%
        _fund(_protectedTerms(ID));
        buyerStart = usdc.balanceOf(buyer);
        vm.prank(seller);
        ta.markShipped(ID);
        vm.prank(buyer);
        ta.dispute(ID);
    }

    function test_Resolve_FullToSeller() public {
        uint256 fee = PRICE / 100;
        vm.expectEmit(address(ta));
        emit TrueAlert.OrderResolved(ID, PRICE - fee, 0, fee, false);
        vm.prank(arbiter);
        ta.resolve(ID, PRICE);

        assertEq(usdc.balanceOf(seller), PRICE - fee);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(buyer), buyerStart);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Resolved));
    }

    function test_Resolve_FullToBuyer() public {
        vm.prank(arbiter);
        ta.resolve(ID, 0);
        assertEq(usdc.balanceOf(buyer), buyerStart + PRICE);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(treasury), 0, "no fee when seller gets nothing");
    }

    function test_Resolve_Split() public {
        uint256 sellerShare = PRICE / 2;
        uint256 fee = sellerShare / 100;
        vm.prank(arbiter);
        ta.resolve(ID, sellerShare);
        assertEq(usdc.balanceOf(seller), sellerShare - fee);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(buyer), buyerStart + PRICE - sellerShare);
        assertEq(usdc.balanceOf(address(ta)), 0);
    }

    function test_Resolve_AtDisputeDeadline() public {
        vm.warp(_order(ID).disputeDeadline);
        vm.prank(arbiter);
        ta.resolve(ID, 0);
    }

    function test_Resolve_WorksWhilePaused() public {
        vm.prank(owner);
        ta.pause();
        vm.prank(arbiter);
        ta.resolve(ID, 0);
        assertEq(usdc.balanceOf(buyer), buyerStart + PRICE);
    }

    function test_RevertWhen_NotArbiter() public {
        vm.expectRevert(TrueAlert.NotArbiter.selector);
        vm.prank(owner); // not even the owner
        ta.resolve(ID, PRICE);
    }

    function test_RevertWhen_ShareAboveAmount() public {
        vm.expectRevert(TrueAlert.InvalidShare.selector);
        vm.prank(arbiter);
        ta.resolve(ID, PRICE + 1);
    }

    function test_RevertWhen_AfterDisputeDeadline() public {
        vm.warp(_order(ID).disputeDeadline + 1);
        vm.expectRevert(TrueAlert.DeadlinePassed.selector);
        vm.prank(arbiter);
        ta.resolve(ID, PRICE);
    }

    function test_RevertWhen_ResolvedTwice() public {
        vm.prank(arbiter);
        ta.resolve(ID, 0);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Resolved)
        );
        vm.prank(arbiter);
        ta.resolve(ID, PRICE);
    }

    function test_RevertWhen_NotDisputed() public {
        bytes32 id2 = keccak256("order-2");
        _fund(_protectedTerms(id2));
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Funded)
        );
        vm.prank(arbiter);
        ta.resolve(id2, 0);
    }

    function test_RevertWhen_NoOrderAndZeroArbiterCaller() public {
        // Unknown order has arbiter == address(0); nobody may act as it.
        vm.expectRevert(TrueAlert.NotArbiter.selector);
        vm.prank(address(0));
        ta.resolve(keccak256("nope"), 0);
    }

    function testFuzz_Resolve_ConservesFunds(uint256 sellerShare) public {
        sellerShare = bound(sellerShare, 0, PRICE);
        vm.prank(arbiter);
        ta.resolve(ID, sellerShare);
        uint256 paidOut = usdc.balanceOf(seller) + usdc.balanceOf(treasury)
            + (usdc.balanceOf(buyer) - buyerStart);
        assertEq(paidOut, PRICE);
        assertEq(usdc.balanceOf(address(ta)), 0);
    }
}
