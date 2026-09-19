// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertReclaimTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        ta.setFee(200, treasury); // refunds must ignore it
        _fund(_protectedTerms(ID));
    }

    function test_Reclaim_AfterShipDeadline() public {
        uint256 before = usdc.balanceOf(buyer);
        vm.warp(_order(ID).shipDeadline + 1);

        vm.expectEmit(address(ta));
        emit TrueAlert.OrderRefunded(ID, PRICE);
        vm.prank(buyer);
        ta.reclaim(ID);

        assertEq(usdc.balanceOf(buyer), before + PRICE, "full refund");
        assertEq(usdc.balanceOf(treasury), 0, "no fee on refunds");
        assertEq(usdc.balanceOf(address(ta)), 0);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Refunded));
    }

    function test_Reclaim_Native() public {
        bytes32 id2 = keccak256("order-2");
        TrueAlert.Terms memory t = _protectedTerms(id2);
        t.token = address(0);
        t.amount = ETN_PRICE;
        _fund(t);
        uint256 before = buyer.balance;
        vm.warp(ta.getOrder(id2).shipDeadline + 1);
        vm.prank(buyer);
        ta.reclaim(id2);
        assertEq(buyer.balance, before + ETN_PRICE);
    }

    function test_RevertWhen_AtShipDeadline() public {
        vm.warp(_order(ID).shipDeadline); // seller still has this second
        vm.expectRevert(TrueAlert.DeadlineNotReached.selector);
        vm.prank(buyer);
        ta.reclaim(ID);
    }

    function test_RevertWhen_Shipped() public {
        vm.prank(seller);
        ta.markShipped(ID);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Shipped)
        );
        vm.prank(buyer);
        ta.reclaim(ID);
    }

    function test_RevertWhen_NotBuyer() public {
        vm.warp(_order(ID).shipDeadline + 1);
        vm.expectRevert(TrueAlert.NotBuyer.selector);
        vm.prank(stranger);
        ta.reclaim(ID);
    }

    function test_SellerCannotShipAfterReclaim() public {
        vm.warp(_order(ID).shipDeadline + 1);
        vm.prank(buyer);
        ta.reclaim(ID);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Refunded)
        );
        vm.prank(seller);
        ta.markShipped(ID);
    }
}
