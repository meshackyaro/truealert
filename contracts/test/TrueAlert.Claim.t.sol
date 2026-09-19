// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertClaimTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function setUp() public override {
        super.setUp();
        _fund(_protectedTerms(ID));
    }

    function _ship() internal {
        vm.prank(seller);
        ta.markShipped(ID);
    }

    function test_Claim_AfterConfirmDeadline() public {
        _ship();
        vm.warp(_order(ID).confirmDeadline + 1);

        vm.expectEmit(address(ta));
        emit TrueAlert.OrderReleased(ID, PRICE, 0);
        vm.prank(seller);
        ta.claim(ID);

        assertEq(usdc.balanceOf(seller), PRICE);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Released));
    }

    function test_Claim_DeductsFee() public {
        // Fee must be set before funding to apply, so use a fresh order.
        vm.prank(owner);
        ta.setFee(100, treasury);
        bytes32 id2 = keccak256("order-2");
        _fund(_protectedTerms(id2));
        vm.prank(seller);
        ta.markShipped(id2);
        vm.warp(ta.getOrder(id2).confirmDeadline + 1);
        vm.prank(seller);
        ta.claim(id2);
        assertEq(usdc.balanceOf(treasury), PRICE / 100);
        assertEq(usdc.balanceOf(seller), PRICE - PRICE / 100);
    }

    function test_RevertWhen_AtConfirmDeadline() public {
        _ship();
        vm.warp(_order(ID).confirmDeadline); // buyer still has this second
        vm.expectRevert(TrueAlert.DeadlineNotReached.selector);
        vm.prank(seller);
        ta.claim(ID);
    }

    function test_RevertWhen_NotShipped() public {
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Funded)
        );
        vm.prank(seller);
        ta.claim(ID);
    }

    function test_RevertWhen_NotSeller() public {
        _ship();
        vm.warp(_order(ID).confirmDeadline + 1);
        vm.expectRevert(TrueAlert.NotSeller.selector);
        vm.prank(stranger);
        ta.claim(ID);
    }

    function test_RevertWhen_AlreadyConfirmed() public {
        _ship();
        vm.prank(buyer);
        ta.confirmReceived(ID);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Released)
        );
        vm.prank(seller);
        ta.claim(ID);
    }
}
