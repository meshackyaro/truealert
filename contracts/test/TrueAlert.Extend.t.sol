// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertExtendTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function setUp() public override {
        super.setUp();
        _fund(_protectedTerms(ID));
        vm.prank(seller);
        ta.markShipped(ID);
    }

    function test_Extend() public {
        uint64 original = _order(ID).confirmDeadline;
        vm.expectEmit(address(ta));
        emit TrueAlert.OrderExtended(ID, original + 48 hours);
        vm.prank(buyer);
        ta.extend(ID, 48 hours);

        TrueAlert.Order memory o = _order(ID);
        assertEq(o.confirmDeadline, original + 48 hours);
        assertTrue(o.extended);
    }

    function test_Extend_DelaysClaim() public {
        uint64 original = _order(ID).confirmDeadline;
        vm.prank(buyer);
        ta.extend(ID, 12 hours);

        vm.warp(original + 1);
        vm.expectRevert(TrueAlert.DeadlineNotReached.selector);
        vm.prank(seller);
        ta.claim(ID);

        vm.warp(original + 12 hours + 1);
        vm.prank(seller);
        ta.claim(ID);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_Extend_AtConfirmDeadline() public {
        vm.warp(_order(ID).confirmDeadline);
        vm.prank(buyer);
        ta.extend(ID, 1 hours);
    }

    function test_RevertWhen_ExtendedTwice() public {
        vm.prank(buyer);
        ta.extend(ID, 1 hours);
        vm.expectRevert(TrueAlert.AlreadyExtended.selector);
        vm.prank(buyer);
        ta.extend(ID, 1 hours);
    }

    function test_RevertWhen_TooLong() public {
        vm.expectRevert(TrueAlert.InvalidExtension.selector);
        vm.prank(buyer);
        ta.extend(ID, 48 hours + 1);
    }

    function test_RevertWhen_Zero() public {
        vm.expectRevert(TrueAlert.InvalidExtension.selector);
        vm.prank(buyer);
        ta.extend(ID, 0);
    }

    function test_RevertWhen_AfterConfirmDeadline() public {
        vm.warp(_order(ID).confirmDeadline + 1);
        vm.expectRevert(TrueAlert.DeadlinePassed.selector);
        vm.prank(buyer);
        ta.extend(ID, 1 hours);
    }

    function test_RevertWhen_NotBuyer() public {
        vm.expectRevert(TrueAlert.NotBuyer.selector);
        vm.prank(seller);
        ta.extend(ID, 1 hours);
    }

    function test_RevertWhen_NotShipped() public {
        bytes32 id2 = keccak256("order-2");
        _fund(_protectedTerms(id2));
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Funded)
        );
        vm.prank(buyer);
        ta.extend(id2, 1 hours);
    }
}
