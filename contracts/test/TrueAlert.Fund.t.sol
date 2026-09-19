// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertFundTest is TrueAlertBase {
    bytes32 internal constant ID = keccak256("order-1");

    function test_Fund_Usdc() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        uint64 expectedShip = uint64(block.timestamp + 24 hours);

        vm.expectEmit(address(ta));
        emit TrueAlert.OrderFunded(
            ID, seller, buyer, address(usdc), PRICE, expectedShip, arbiter, 0
        );
        vm.prank(buyer);
        ta.fund(t, sig);

        assertEq(usdc.balanceOf(address(ta)), PRICE, "escrow holds funds");
        assertEq(usdc.balanceOf(seller), 0);
        assertTrue(ta.used(ID));

        TrueAlert.Order memory o = _order(ID);
        assertEq(uint8(o.status), uint8(TrueAlert.Status.Funded));
        assertEq(o.seller, seller);
        assertEq(o.buyer, buyer);
        assertEq(o.token, address(usdc));
        assertEq(o.amount, PRICE);
        assertEq(o.arbiter, arbiter);
        assertEq(o.shipDeadline, expectedShip);
        assertEq(o.confirmDeadline, 0);
        assertEq(o.confirmWindow, 24 hours);
        assertFalse(o.extended);
    }

    function test_Fund_Native() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.token = address(0);
        t.amount = ETN_PRICE;
        _fund(t);
        assertEq(address(ta).balance, ETN_PRICE);
        assertEq(_order(ID).amount, ETN_PRICE);
    }

    function test_Fund_SnapshotsFee() public {
        vm.prank(owner);
        ta.setFee(150, treasury);
        _fund(_protectedTerms(ID));
        vm.prank(owner);
        ta.setFee(200, treasury);
        assertEq(_order(ID).feeBps, 150, "later fee change doesn't touch funded order");
    }

    function test_Fund_WithoutArbiter() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.arbiter = address(0);
        _fund(t);
        assertEq(_order(ID).arbiter, address(0));
    }

    function test_Fund_WindowBoundsInclusive() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.shipWindow = ta.MIN_SHIP_WINDOW();
        t.confirmWindow = ta.MIN_CONFIRM_WINDOW();
        _fund(t);

        TrueAlert.Terms memory t2 = _protectedTerms(keccak256("order-2"));
        t2.shipWindow = ta.MAX_SHIP_WINDOW();
        t2.confirmWindow = ta.MAX_CONFIRM_WINDOW();
        _fund(t2);
    }

    function test_RevertWhen_ShipWindowTooShort() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.shipWindow = 1 hours - 1;
        _expectFundRevert(t, TrueAlert.InvalidWindows.selector);
    }

    function test_RevertWhen_ShipWindowTooLong() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.shipWindow = 14 days + 1;
        _expectFundRevert(t, TrueAlert.InvalidWindows.selector);
    }

    function test_RevertWhen_ConfirmWindowTooShort() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.confirmWindow = 12 hours - 1; // seller can't rush the buyer
        _expectFundRevert(t, TrueAlert.InvalidWindows.selector);
    }

    function test_RevertWhen_ConfirmWindowTooLong() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.confirmWindow = 14 days + 1;
        _expectFundRevert(t, TrueAlert.InvalidWindows.selector);
    }

    function test_RevertWhen_ArbiterIsSeller() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.arbiter = seller;
        _expectFundRevert(t, TrueAlert.InvalidArbiter.selector);
    }

    function test_RevertWhen_ArbiterIsBuyer() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.arbiter = buyer;
        _expectFundRevert(t, TrueAlert.InvalidArbiter.selector);
    }

    function test_RevertWhen_SellerFundsOwnOrder() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(TrueAlert.SellerCannotBuy.selector);
        vm.prank(seller);
        ta.fund(t, sig);
    }

    function test_RevertWhen_PayNowTermsFunded() public {
        TrueAlert.Terms memory t = _payNowTerms(ID);
        _expectFundRevert(t, TrueAlert.WrongMode.selector);
    }

    function test_RevertWhen_FundedTwice() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        _fund(t);
        _expectFundRevert(t, TrueAlert.TermsAlreadyUsed.selector);
    }

    function test_RevertWhen_Expired() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        vm.warp(t.expiry + 1);
        _expectFundRevert(t, TrueAlert.TermsExpired.selector);
    }

    function test_RevertWhen_LockedToOtherBuyer() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.buyer = makeAddr("regular-customer");
        _expectFundRevert(t, TrueAlert.NotDesignatedBuyer.selector);
    }

    function test_RevertWhen_NativeWrongValue() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.token = address(0);
        t.amount = ETN_PRICE;
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(abi.encodeWithSelector(TrueAlert.WrongValue.selector, 1, ETN_PRICE));
        vm.prank(buyer);
        ta.fund{value: 1}(t, sig);
    }

    function test_RevertWhen_Paused() public {
        vm.prank(owner);
        ta.pause();
        TrueAlert.Terms memory t = _protectedTerms(ID);
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(buyer);
        ta.fund(t, sig);
    }

    function test_FailedFundLeavesNoOrder() public {
        TrueAlert.Terms memory t = _protectedTerms(ID);
        t.confirmWindow = 1;
        _expectFundRevert(t, TrueAlert.InvalidWindows.selector);
        assertFalse(ta.used(ID));
        assertEq(uint8(_order(ID).status), uint8(TrueAlert.Status.None));
    }

    function _expectFundRevert(TrueAlert.Terms memory t, bytes4 selector) internal {
        bytes memory sig = _sign(sellerKey, t);
        vm.expectRevert(selector);
        vm.prank(buyer);
        ta.fund(t, sig);
    }
}
