// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertAdminTest is TrueAlertBase {
    function test_Constructor_SetsOwnerAndAllowsNative() public view {
        assertEq(ta.owner(), owner);
        assertTrue(ta.allowedToken(ta.NATIVE()));
    }

    function test_SetTokenAllowed() public {
        address token = makeAddr("token");
        vm.expectEmit(address(ta));
        emit TrueAlert.TokenAllowed(token, true);
        vm.prank(owner);
        ta.setTokenAllowed(token, true);
        assertTrue(ta.allowedToken(token));

        vm.prank(owner);
        ta.setTokenAllowed(token, false);
        assertFalse(ta.allowedToken(token));
    }

    function test_RevertWhen_NonOwnerSetsToken() public {
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        vm.prank(stranger);
        ta.setTokenAllowed(address(usdc), false);
    }

    function test_PauseAndUnpause() public {
        vm.prank(owner);
        ta.pause();
        assertTrue(ta.paused());
        vm.prank(owner);
        ta.unpause();
        assertFalse(ta.paused());
    }

    function test_RevertWhen_NonOwnerPauses() public {
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        vm.prank(stranger);
        ta.pause();
    }

    function test_FeeStartsAtZero() public view {
        assertEq(ta.feeBps(), 0);
        assertEq(ta.feeRecipient(), address(0));
    }

    function test_SetFee() public {
        address treasury = makeAddr("treasury");
        vm.expectEmit(address(ta));
        emit TrueAlert.FeeUpdated(150, treasury);
        vm.prank(owner);
        ta.setFee(150, treasury);
        assertEq(ta.feeBps(), 150);
        assertEq(ta.feeRecipient(), treasury);
    }

    function test_SetFeeAtCap() public {
        vm.prank(owner);
        ta.setFee(200, makeAddr("treasury"));
        assertEq(ta.feeBps(), 200);
    }

    function test_RevertWhen_FeeAboveCap() public {
        vm.expectRevert(abi.encodeWithSelector(TrueAlert.FeeTooHigh.selector, 201, 200));
        vm.prank(owner);
        ta.setFee(201, makeAddr("treasury"));
    }

    function test_RevertWhen_FeeWithoutRecipient() public {
        vm.expectRevert(TrueAlert.ZeroFeeRecipient.selector);
        vm.prank(owner);
        ta.setFee(100, address(0));
    }

    function test_ZeroFeeAllowsZeroRecipient() public {
        vm.prank(owner);
        ta.setFee(0, address(0));
        assertEq(ta.feeBps(), 0);
    }

    function test_RevertWhen_NonOwnerSetsFee() public {
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        vm.prank(stranger);
        ta.setFee(100, stranger);
    }

    function testFuzz_FeeNeverExceedsCap(uint16 bps) public {
        vm.prank(owner);
        if (bps > 200) {
            vm.expectRevert(abi.encodeWithSelector(TrueAlert.FeeTooHigh.selector, bps, 200));
            ta.setFee(bps, makeAddr("treasury"));
        } else {
            ta.setFee(bps, makeAddr("treasury"));
            assertEq(ta.feeBps(), bps);
        }
        assertLe(ta.feeBps(), 200);
    }

    function test_OwnershipTransferIsTwoStep() public {
        address next = makeAddr("next");
        vm.prank(owner);
        ta.transferOwnership(next);
        assertEq(ta.owner(), owner);
        vm.prank(next);
        ta.acceptOwnership();
        assertEq(ta.owner(), next);
    }
}
