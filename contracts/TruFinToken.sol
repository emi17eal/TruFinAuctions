// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TruFinToken is ERC20 {
    constructor (address[] memory receivers) ERC20("TruFin", "TF") {
        for (uint i = 0; i < receivers.length; i++) {
            _mint(receivers[i], 1000 ether);
        }
    }
}