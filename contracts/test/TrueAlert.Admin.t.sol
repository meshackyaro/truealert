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
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        ta.setTokenAllowed(address(usdc), false);
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
