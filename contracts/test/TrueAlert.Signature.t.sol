// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TrueAlert} from "../src/TrueAlert.sol";
import {TrueAlertBase} from "./TrueAlertBase.t.sol";

contract TrueAlertSignatureTest is TrueAlertBase {
    /// @dev Recomputes the digest by hand so a typo in the typehash or field
    ///      order in the contract cannot hide behind `ta.hashTerms`.
    function test_HashTerms_MatchesManualEip712() public view {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        bytes32 typehash = keccak256(
            "Terms(bytes32 id,uint8 mode,address seller,address token,uint256 amount,uint64 expiry,"
            "address buyer,uint32 shipWindow,uint32 confirmWindow,address arbiter,bytes32 ref)"
        );
        bytes32 structHash = keccak256(
            abi.encode(
                typehash,
                t.id,
                uint8(t.mode),
                t.seller,
                t.token,
                t.amount,
                t.expiry,
                t.buyer,
                t.shipWindow,
                t.confirmWindow,
                t.arbiter,
                t.ref
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("TrueAlert"),
                keccak256("1"),
                block.chainid,
                address(ta)
            )
        );
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertEq(ta.hashTerms(t), expected);
        assertEq(ta.TERMS_TYPEHASH(), typehash);
    }

    function test_ValidSellerSignature() public view {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        assertTrue(ta.isValidSellerSignature(t, _sign(sellerKey, t)));
    }

    function test_InvalidWhen_SignedByOtherKey() public {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        (, uint256 otherKey) = makeAddrAndKey("impostor");
        assertFalse(ta.isValidSellerSignature(t, _sign(otherKey, t)));
    }

    function test_InvalidWhen_AmountTampered() public view {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        bytes memory sig = _sign(sellerKey, t);
        t.amount = 1;
        assertFalse(ta.isValidSellerSignature(t, sig));
    }

    function test_InvalidWhen_SellerSwapped() public {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        bytes memory sig = _sign(sellerKey, t);
        t.seller = makeAddr("thief");
        assertFalse(ta.isValidSellerSignature(t, sig));
    }

    function test_InvalidWhen_OtherChain() public {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        bytes memory sig = _sign(sellerKey, t);
        vm.chainId(52014); // same terms replayed on mainnet
        assertFalse(ta.isValidSellerSignature(t, sig));
    }

    function test_InvalidWhen_OtherContract() public {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        bytes memory sig = _sign(sellerKey, t);
        TrueAlert other = new TrueAlert(owner);
        assertFalse(other.isValidSellerSignature(t, sig));
    }

    function test_InvalidWhen_GarbageSignature() public view {
        TrueAlert.Terms memory t = _payNowTerms(keccak256("inv-1"));
        assertFalse(ta.isValidSellerSignature(t, hex"deadbeef"));
    }
}
