// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC internal usdc;
    address internal alice = makeAddr("alice");

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_Metadata() public view {
        assertEq(usdc.name(), "Mock USD Coin");
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
    }

    function test_AnyoneCanMint() public {
        vm.prank(alice);
        usdc.mint(alice, 250e6);
        assertEq(usdc.balanceOf(alice), 250e6);
        assertEq(usdc.totalSupply(), 250e6);
    }

    function test_MintAtCap() public {
        usdc.mint(alice, usdc.MAX_MINT());
        assertEq(usdc.balanceOf(alice), 10_000e6);
    }

    function test_RevertWhen_MintAboveCap() public {
        uint256 tooMuch = usdc.MAX_MINT() + 1;
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.MintTooLarge.selector, tooMuch, 10_000e6));
        usdc.mint(alice, tooMuch);
    }

    function testFuzz_Mint(uint256 amount) public {
        amount = bound(amount, 0, usdc.MAX_MINT());
        usdc.mint(alice, amount);
        assertEq(usdc.balanceOf(alice), amount);
    }
}
