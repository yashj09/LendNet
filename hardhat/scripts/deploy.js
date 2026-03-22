const hre = require("hardhat");

async function main() {
  console.log("Deploying USDT to Sepolia...");

  const USDT = await hre.ethers.getContractFactory("USDT");
  const usdt = await USDT.deploy();
  await usdt.waitForDeployment();

  const address = await usdt.getAddress();
  const [deployer] = await hre.ethers.getSigners();

  console.log(`\nUSDT deployed at: ${address}`);
  console.log(`Owner (deployer): ${deployer.address}`);
  console.log(`\nAdd to your .env:`);
  console.log(`LNUSD_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
