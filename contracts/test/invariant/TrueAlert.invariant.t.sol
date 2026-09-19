// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TrueAlert} from "../../src/TrueAlert.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {TrueAlertHandler} from "./TrueAlertHandler.sol";

contract TrueAlertInvariantTest is Test {
    TrueAlert internal ta;
    MockUSDC internal usdc;
    TrueAlertHandler internal handler;

    function setUp() public {
        vm.warp(1_790_000_000);
        address owner = makeAddr("inv-owner");
        ta = new TrueAlert(owner);
        usdc = new MockUSDC();
        vm.prank(owner);
        ta.setTokenAllowed(address(usdc), true);

        handler = new TrueAlertHandler(ta, usdc, owner);
        targetContract(address(handler));
    }

    /// @notice The contract holds exactly the funds of open orders — never more
    ///         (nothing stranded) and never less (nothing paid out twice).
    function invariant_EscrowBalanceEqualsOpenOrders() public view {
        (uint256 openUsdc, uint256 openNative) = _openTotals();
        assertEq(usdc.balanceOf(address(ta)), openUsdc, "USDC escrow mismatch");
        assertEq(address(ta).balance, openNative, "ETN escrow mismatch");
    }

    function invariant_FeeNeverAboveCap() public view {
        assertLe(ta.feeBps(), ta.MAX_FEE_BPS());
    }

    function invariant_OrderFeeNeverAboveCap() public view {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            assertLe(ta.getOrder(handler.ids(i)).feeBps, 200);
        }
    }

    /// @notice Coverage report: run with -vv to see how often each transition
    ///         actually succeeded (not just was attempted).
    function afterInvariant() external view {
        string[10] memory actions = [
            "fund",
            "ship",
            "confirm",
            "claim",
            "reclaim",
            "cancel",
            "extend",
            "dispute",
            "resolve",
            "resolveTimeout"
        ];
        for (uint256 i; i < actions.length; ++i) {
            console.log(actions[i], handler.ghostSuccess(bytes32(bytes(actions[i]))));
        }
    }

    function _openTotals() internal view returns (uint256 openUsdc, uint256 openNative) {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            TrueAlert.Order memory o = ta.getOrder(handler.ids(i));
            bool open = o.status == TrueAlert.Status.Funded || o.status == TrueAlert.Status.Shipped
                || o.status == TrueAlert.Status.Disputed;
            if (!open) continue;
            if (o.token == address(0)) openNative += o.amount;
            else openUsdc += o.amount;
        }
    }
}
