// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertShipTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function setUp() public override {
        super.setUp();
        _fund(_protectedTerms(ID));
    }

    function test_MarkShipped() public {
        vm.warp(block.timestamp + 3 hours);
        uint64 expected = uint64(block.timestamp + 24 hours);

        vm.expectEmit(address(ta));
        emit TrueAlert.OrderShipped(ID, expected);
        vm.prank(seller);
        ta.markShipped(ID);

        TrueAlert.Order memory o = _order(ID);
        assertEq(uint8(o.status), uint8(TrueAlert.Status.Shipped));
        assertEq(o.confirmDeadline, expected);
    }

    function test_MarkShipped_AtShipDeadline() public {
        vm.warp(_order(ID).shipDeadline);
        vm.prank(seller);
        ta.markShipped(ID);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Shipped));
    }

    function test_RevertWhen_AfterShipDeadline() public {
        vm.warp(_order(ID).shipDeadline + 1);
        vm.expectRevert(TrueAlert.DeadlinePassed.selector);
        vm.prank(seller);
        ta.markShipped(ID);
    }

    function test_RevertWhen_NotSeller() public {
        vm.expectRevert(TrueAlert.NotSeller.selector);
        vm.prank(buyer);
        ta.markShipped(ID);
    }

    function test_RevertWhen_AlreadyShipped() public {
        vm.prank(seller);
        ta.markShipped(ID);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Shipped)
        );
        vm.prank(seller);
        ta.markShipped(ID);
    }

    function test_RevertWhen_OrderDoesNotExist() public {
        vm.expectRevert(TrueAlert.NotSeller.selector);
        vm.prank(seller);
        ta.markShipped(keccak256("nope"));
    }

    function test_MarkShipped_WorksWhilePaused() public {
        vm.prank(owner);
        ta.pause();
        vm.prank(seller);
        ta.markShipped(ID);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Shipped));
    }
}
