// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TrueAlert} from "../src/TrueAlert.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploys TrueAlert (and MockUSDC on testnet) and allowlists the stablecoin.
///
/// Env:
///   PRIVATE_KEY     deployer key (becomes owner unless OWNER is set)
///   OWNER           optional owner address (e.g. a hardware wallet)
///   USDC            optional existing USDC address; if unset, MockUSDC is deployed
///
/// Testnet:
///   forge script script/Deploy.s.sol --rpc-url electroneum_testnet --broadcast
contract Deploy is Script {
    function run() external returns (TrueAlert ta, address usdc) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER", vm.addr(deployerKey));
        return deploy(deployerKey, owner, vm.envOr("USDC", address(0)));
    }

    function deploy(uint256 deployerKey, address owner, address existingUsdc)
        public
        returns (TrueAlert ta, address usdc)
    {
        address deployer = vm.addr(deployerKey);
        usdc = existingUsdc;

        vm.startBroadcast(deployerKey);

        if (usdc == address(0)) {
            usdc = address(new MockUSDC());
        }
        // Deployer is the initial owner so it can allowlist USDC in the same run,
        // then hands ownership over if a different OWNER was given.
        ta = new TrueAlert(deployer);
        ta.setTokenAllowed(usdc, true);
        if (owner != deployer) {
            ta.transferOwnership(owner); // OWNER must call acceptOwnership()
        }

        vm.stopBroadcast();

        console.log("Chain ID:          ", block.chainid);
        console.log("TrueAlert:         ", address(ta));
        console.log("USDC:              ", usdc);
        console.log("Owner (pending if different):", owner);
    }
}
