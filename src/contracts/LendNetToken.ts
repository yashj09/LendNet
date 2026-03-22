import { ethers } from 'ethers';
import artifact from './USDT.json';
import { CONFIG } from '../config/index.js';

/**
 * Deploys and manages the USDT test token on Sepolia.
 * Compiled via Hardhat from hardhat/contracts/USDT.sol.
 * The deployer (owner) can mint tokens to fund AI agent wallets.
 */
export class LendNetToken {
  private provider: ethers.JsonRpcProvider;
  private deployer: ethers.Wallet;
  private contract: ethers.Contract | null = null;
  private _address: string = '';
  private artifact: { abi: any[]; bytecode: string };

  constructor(deployerPrivateKey: string) {
    this.provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    this.deployer = new ethers.Wallet(deployerPrivateKey, this.provider);
    this.artifact = artifact;
  }

  get address(): string {
    return this._address;
  }

  get deployerAddress(): string {
    return this.deployer.address;
  }

  /**
   * Deploy a fresh USDT token, or connect to an existing deployment.
   */
  async initialize(existingAddress?: string): Promise<string> {
    if (existingAddress) {
      this.contract = new ethers.Contract(existingAddress, this.artifact.abi, this.deployer);
      this._address = existingAddress;
      const name = await this.contract.name();
      const supply = await this.contract.totalSupply();
      console.log(`[Token] Connected to ${name} at ${existingAddress} (supply: ${Number(supply) / 1e6} USDT)`);
      return existingAddress;
    }

    // Deploy new USDT token
    console.log(`[Token] Deploying USDT from ${this.deployer.address}...`);
    const factory = new ethers.ContractFactory(this.artifact.abi, this.artifact.bytecode, this.deployer);
    const deployed = await factory.deploy();
    await deployed.waitForDeployment();
    this._address = await deployed.getAddress();
    this.contract = new ethers.Contract(this._address, this.artifact.abi, this.deployer);
    console.log(`[Token] USDT deployed at ${this._address}`);
    return this._address;
  }

  /**
   * Mint tokens to an agent's wallet address. Only deployer can call.
   */
  async mint(to: string, amount: number): Promise<string> {
    if (!this.contract) throw new Error('Token not initialized');
    const units = BigInt(Math.round(amount * 1e6));
    const tx = await this.contract.mint(to, units);
    const receipt = await tx.wait();
    console.log(`[Token] Minted ${amount} USDT to ${to.slice(0, 10)}... — tx: ${receipt.hash}`);
    return receipt.hash;
  }

  /**
   * Send Sepolia ETH to an agent for gas fees.
   */
  async fundGas(to: string, ethAmount: number = 0.005): Promise<string> {
    const tx = await this.deployer.sendTransaction({
      to,
      value: ethers.parseEther(ethAmount.toString()),
    });
    const receipt = await tx.wait();
    console.log(`[Token] Sent ${ethAmount} ETH to ${to.slice(0, 10)}... for gas — tx: ${receipt!.hash}`);
    return receipt!.hash;
  }

  /**
   * Get USDT balance for any address.
   */
  async balanceOf(address: string): Promise<number> {
    if (!this.contract) throw new Error('Token not initialized');
    const balance = await this.contract.balanceOf(address);
    return Number(balance) / 1e6;
  }

  /**
   * Get deployer's ETH balance.
   */
  async getDeployerEthBalance(): Promise<number> {
    const balance = await this.provider.getBalance(this.deployer.address);
    return Number(ethers.formatEther(balance));
  }
}
