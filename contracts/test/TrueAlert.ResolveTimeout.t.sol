// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertResolveTimeoutTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");
    uint256 internal buyerStart;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        ta.setFee(200, treasury);
        _fund(_protectedTerms(ID));
        buyerStart = usdc.balanceOf(buyer);
        vm.prank(seller);
        ta.markShipped(ID);
        vm.prank(buyer);
        ta.dispute(ID);
    }

    function test_ResolveTimeout_FullRefundToBuyer() public {
        vm.warp(_order(ID).disputeDeadline + 1);
        vm.expectEmit(address(ta));
        emit TrueAlert.OrderResolved(ID, 0, PRICE, 0, true);
        vm.prank(stranger); // anyone can trigger it
        ta.resolveTimeout(ID);

        assertEq(usdc.balanceOf(buyer), buyerStart + PRICE);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Resolved));
    }

    function test_ResolveTimeout_BlocksLateRuling() public {
        vm.warp(_order(ID).disputeDeadline + 1);
        vm.prank(buyer);
        ta.resolveTimeout(ID);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Resolved)
        );
        vm.prank(arbiter);
        ta.resolve(ID, PRICE);
    }

    function test_RevertWhen_AtDisputeDeadline() public {
        vm.warp(_order(ID).disputeDeadline); // arbiter still has this second
        vm.expectRevert(TrueAlert.DeadlineNotReached.selector);
        ta.resolveTimeout(ID);
    }

    function test_RevertWhen_AlreadyRuled() public {
        vm.prank(arbiter);
        ta.resolve(ID, PRICE);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Resolved)
        );
        ta.resolveTimeout(ID);
    }

    function test_RevertWhen_NotDisputed() public {
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.None)
        );
        ta.resolveTimeout(keccak256("nope"));
    }
}
