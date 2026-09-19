// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @dev Calls `deploy(...)` directly: `vm.setEnv` is process-wide and would
///      race between tests running in parallel.
contract DeployScriptTest is Test {
    uint256 internal constant KEY = 0xA11CE;
    address internal deployer = vm.addr(KEY);

    function test_DeploysMockUsdcAndAllowlistsIt() public {
        (TrueAlert ta, address usdc) = new Deploy().deploy(KEY, deployer, address(0));
        assertEq(ta.owner(), deployer);
        assertTrue(ta.allowedToken(usdc));
        assertTrue(ta.allowedToken(address(0)));
        assertEq(MockUSDC(usdc).decimals(), 6);
        assertEq(ta.feeBps(), 0);
    }

    function test_UsesExistingUsdc() public {
        address existing = address(new MockUSDC());
        (TrueAlert ta, address usdc) = new Deploy().deploy(KEY, deployer, existing);
        assertEq(usdc, existing);
        assertTrue(ta.allowedToken(existing));
    }

    function test_HandsOwnershipToOwner() public {
        address hw = makeAddr("hardware-wallet");
        (TrueAlert ta,) = new Deploy().deploy(KEY, hw, address(0));
        assertEq(ta.owner(), deployer, "deployer until accepted");
        assertEq(ta.pendingOwner(), hw);
        vm.prank(hw);
        ta.acceptOwnership();
        assertEq(ta.owner(), hw);
    }
}
