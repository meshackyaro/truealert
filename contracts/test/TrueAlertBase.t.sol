// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Shared fixture for TrueAlert tests.
abstract contract TrueAlertBase is Test {
    TrueAlert internal ta;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        ta = new TrueAlert(owner);
        usdc = new MockUSDC();
        vm.prank(owner);
        ta.setTokenAllowed(address(usdc), true);
    }
}
