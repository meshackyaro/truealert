// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertConfirmTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function test_Confirm_AfterShipping() public {
        _fund(_protectedTerms(ID));
        vm.prank(seller);
        ta.markShipped(ID);

        vm.expectEmit(address(ta));
        emit TrueAlert.OrderReleased(ID, PRICE, 0);
        vm.prank(buyer);
        ta.confirmReceived(ID);

        assertEq(usdc.balanceOf(seller), PRICE);
        assertEq(usdc.balanceOf(address(ta)), 0);
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.Released));
    }

    function test_Confirm_BeforeShipping() public {
        _fund(_protectedTerms(ID));
        vm.prank(buyer);
        ta.confirmReceived(ID);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_Confirm_AfterConfirmDeadline() public {
        _fund(_protectedTerms(ID));
        vm.prank(seller);
        ta.markShipped(ID);
        vm.warp(_order(ID).confirmDeadline + 5 days); // late but still fine
        vm.prank(buyer);
        ta.confirmReceived(ID);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_Confirm_DeductsSnapshottedFee() public {
        vm.prank(owner);
        ta.setFee(150, treasury); // 1.5%
        _fund(_protectedTerms(ID));
        vm.prank(owner);
        ta.setFee(200, treasury); // later change must not apply

        uint256 fee = PRICE * 150 / 10_000; // 163,800 = 0.1638 USDC
        vm.expectEmit(address(ta));
        emit TrueAlert.OrderReleased(ID, PRICE - fee, fee);
        vm.prank(buyer);
        ta.confirmReceived(ID);

        assertEq(usdc.balanceOf(seller), PRICE - fee);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(address(ta)), 0);
    }

    function test_Confirm_FeeWaivedIfRecipientCleared() public {
        vm.prank(owner);
        ta.setFee(150, treasury);
        _fund(_protectedTerms(ID));
        vm.prank(owner);
        ta.setFee(0, address(0));

        vm.prank(buyer);
        ta.confirmReceived(ID);
        assertEq(usdc.balanceOf(seller), PRICE, "no stranded fee");
        assertEq(usdc.balanceOf(address(ta)), 0);
    }

    function test_Confirm_Native() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.token = address(0);
        t.amount = ETN_PRICE;
        _fund(t);
        vm.prank(buyer);
        ta.confirmReceived(ID);
        assertEq(seller.balance, ETN_PRICE);
        assertEq(address(ta).balance, 0);
    }

    function test_Confirm_WorksWhilePaused() public {
        _fund(_protectedTerms(ID));
        vm.prank(owner);
        ta.pause();
        vm.prank(buyer);
        ta.confirmReceived(ID);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_RevertWhen_NotBuyer() public {
        _fund(_protectedTerms(ID));
        vm.expectRevert(TrueAlert.NotBuyer.selector);
        vm.prank(seller);
        ta.confirmReceived(ID);
    }

    function test_RevertWhen_AlreadyReleased() public {
        _fund(_protectedTerms(ID));
        vm.prank(buyer);
        ta.confirmReceived(ID);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.InvalidStatus.selector, TrueAlert.Status.Released)
        );
        vm.prank(buyer);
        ta.confirmReceived(ID);
    }

    function testFuzz_Confirm_FeeSplitAddsUp(uint256 amount, uint16 bps) public {
        amount = bound(amount, 1, 1_000e6);
        bps = uint16(bound(bps, 0, 200));
        vm.prank(owner);
        ta.setFee(bps, treasury);

        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.amount = amount;
        _fund(t);
        vm.prank(buyer);
        ta.confirmReceived(ID);

        assertEq(usdc.balanceOf(seller) + usdc.balanceOf(treasury), amount);
        assertLe(usdc.balanceOf(treasury), amount * 200 / 10_000);
        assertEq(usdc.balanceOf(address(ta)), 0);
    }
}
