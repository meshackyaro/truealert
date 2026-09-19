// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

/// @dev A seller wallet that refuses ETN.
contract RejectsEther {}

contract TrueAlertPayNowTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("inv-1");

    function test_PayInvoice_Usdc() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);

        vm.expectEmit(address(ta));
        emit TrueAlert.InvoicePaid(ID, seller, buyer, address(usdc), PRICE);
        vm.prank(buyer);
        ta.payInvoice(t, sig);

        assertEq(usdc.balanceOf(seller), PRICE);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - PRICE);
        assertEq(usdc.balanceOf(address(ta)), 0, "contract never holds pay-now funds");
        assertTrue(ta.used(ID));
    }

    function test_PayInvoice_Native() public {
        TrueAlert.Terms memory t = _nativePayNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);

        vm.prank(buyer);
        ta.payInvoice{value: ETN_PRICE}(t, sig);

        assertEq(seller.balance, ETN_PRICE);
        assertEq(address(ta).balance, 0);
    }

    function test_PayInvoice_NoFeeEvenWhenFeeSet() public {
        vm.prank(owner);
        ta.setFee(200, makeAddr("treasury"));
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_PayInvoice_AnyoneCanPayOpenInvoice() public {
        address friend = makeAddr("friend");
        usdc.mint(friend, PRICE);
        vm.prank(friend);
        usdc.approve(address(ta), PRICE);

        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.prank(friend);
        ta.payInvoice(t, sig);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_PayInvoice_LockedToBuyer() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        t.buyer = buyer;
        bytes memory sig = _sign(sellerKey, t);

        vm.expectRevert(TrueAlert.NotDesignatedBuyer.selector);
        vm.prank(stranger);
        ta.payInvoice(t, sig);

        vm.prank(buyer);
        ta.payInvoice(t, sig);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    function test_PayInvoice_AtExactExpiry() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.warp(t.expiry);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_Expired() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.warp(t.expiry + 1);
        vm.expectRevert(TrueAlert.TermsExpired.selector);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_PaidTwice() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
        vm.expectRevert(TrueAlert.TermsAlreadyUsed.selector);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_ProtectedTermsUsedAsPayNow() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        t.mode = TrueAlert.Mode.Protected;
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(TrueAlert.WrongMode.selector);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_TokenNotAllowed() public {
        vm.prank(owner);
        ta.setTokenAllowed(address(usdc), false);
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(abi.encodeWithSelector(TrueAlert.TokenNotAllowed.selector, address(usdc)));
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_ZeroAmount() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        t.amount = 0;
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(TrueAlert.ZeroAmount.selector);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_AmountTampered() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        t.amount = 1; // buyer tries to underpay
        vm.expectRevert(TrueAlert.InvalidSignature.selector);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function test_RevertWhen_NativeWrongValue() public {
        TrueAlert.Terms memory t = _nativePayNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.WrongValue.selector, ETN_PRICE - 1, ETN_PRICE)
        );
        vm.prank(buyer);
        ta.payInvoice{value: ETN_PRICE - 1}(t, sig);

        vm.expectRevert(
            abi.encodeWithSelector(TrueAlert.WrongValue.selector, ETN_PRICE + 1, ETN_PRICE)
        );
        vm.prank(buyer);
        ta.payInvoice{value: ETN_PRICE + 1}(t, sig);
    }

    function test_RevertWhen_EtnSentWithTokenInvoice() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(abi.encodeWithSelector(TrueAlert.WrongValue.selector, 1, 0));
        vm.prank(buyer);
        ta.payInvoice{value: 1}(t, sig);
    }

    function test_RevertWhen_SellerRejectsEther() public {
        RejectsEther wallet = new RejectsEther();
        TrueAlert.Terms memory t = _nativePayNowTerms(ID);
        t.seller = address(wallet);
        // Contract wallet can't sign; use a mocked ERC-1271 check instead.
        vm.mockCall(
            address(wallet),
            abi.encodeWithSignature("isValidSignature(bytes32,bytes)"),
            abi.encode(bytes4(0x1626ba7e))
        );
        vm.expectRevert(TrueAlert.NativeTransferFailed.selector);
        vm.prank(buyer);
        ta.payInvoice{value: ETN_PRICE}(t, hex"01");
        assertFalse(ta.used(ID), "failed payment leaves invoice unused");
    }

    function test_RevertWhen_Paused() public {
        vm.prank(owner);
        ta.pause();
        TrueAlert.Terms memory t = _payNowTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
    }

    function testFuzz_PayInvoice(uint256 amount) public {
        amount = bound(amount, 1, 1_000e6);
        TrueAlert.Terms memory t = _payNowTerms(ID);
        t.amount = amount;
        bytes memory sig = _sign(sellerKey, t);
        vm.prank(buyer);
        ta.payInvoice(t, sig);
        assertEq(usdc.balanceOf(seller), amount);
        assertEq(usdc.balanceOf(address(ta)), 0);
    }
}
