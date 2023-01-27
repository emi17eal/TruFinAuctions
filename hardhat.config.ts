import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades"
import "hardhat-gas-reporter"


const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
    },
    gasReporter: {
      enabled: true,
      currency: 'USD',
      gasPrice: 20
  }
};

export default config;
