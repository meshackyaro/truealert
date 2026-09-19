// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertCancelTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function setUp() public override {
        super.setUp();
        _fund(_protectedTerms(ID));
    }

    function test_Cancel_WhileFunded() public {
        uint256 before = usdc.balanceOf(buyer);
        vm.expectEmit(address(ta));
        emit TrueAlert.OrderRefunded(ID, PRICE);
        vm.prank(seller);
        ta.cancel(ID);
        assertEq(usdc.balanceOf(buyer), before + PRICE);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Refunded));
    }

    function test_Cancel_AfterShipping() public {
        vm.prank(seller);
        ta.markShipped(ID);
        vm.warp(_order(ID).confirmDeadline + 1); // even when claim is possible
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(seller);
        ta.cancel(ID);
        assertEq(usdc.balanceOf(buyer), before + PRICE);
    }

    function test_Cancel_UnexpectedPayerGetsRefund() public {
        // A stranger funds someone else's open link; seller refunds them.
        bytes32 id2 = keccak256("order-2");
        TrueAlert.Terms memory t = _protectedTerms(id2);
        bytes memory sig = _sign(sellerKey, t);
        usdc.mint(stranger, PRICE);
        vm.startPrank(stranger);
        usdc.approve(address(ta), PRICE);
        ta.fund(t, sig);
        vm.stopPrank();

        vm.prank(seller);
        ta.cancel(id2);
        assertEq(usdc.balanceOf(stranger), PRICE, "stranger only hurt themselves temporarily");
    }

    function test_RevertWhen_NotSeller() public {
        vm.expectRevert(TrueAlert.NotSeller.selector);
        vm.prank(buyer);
        ta.cancel(ID);
    }

    function test_RevertWhen_AlreadyReleased() public {
        vm.prank(buyer);
        ta.confirmReceived(ID);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Released)
        );
        vm.prank(seller);
        ta.cancel(ID);
    }

    function test_RevertWhen_AlreadyRefunded() public {
        vm.prank(seller);
        ta.cancel(ID);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Refunded)
        );
        vm.prank(seller);
        ta.cancel(ID);
    }
}
