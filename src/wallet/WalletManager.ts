import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import { CONFIG, fromUsdtUnits, toUsdtUnits } from '../config/index.js';

export interface WalletInfo {
  address: string;
  balanceUsdt: number;
  balanceEth: number;
}

export interface TransferResult {
  hash: string;
  fee: bigint;
  amount: number;
}

/**
 * Wraps Tether WDK for agent wallet operations on Sepolia testnet.
 * Each agent gets its own WalletManager instance with a unique seed.
 */
export class AgentWalletManager {
  private wallet: InstanceType<typeof WalletManagerEvm>;
  private account: any; // WalletAccountEvm
  private _address: string = '';
  private _seed: string;

  constructor(seedPhrase: string) {
    this._seed = seedPhrase;
    this.wallet = new WalletManagerEvm(seedPhrase, {
      provider: CONFIG.rpcUrl,
      transferMaxFee: 100000000000000n,
    });
  }

  static generateSeed(): string {
    return WDK.getRandomSeedPhrase();
  }

  static isValidSeed(seed: string): boolean {
    return WDK.isValidSeed(seed);
  }

  get seed(): string {
    return this._seed;
  }

  get address(): string {
    return this._address;
  }

  async initialize(): Promise<string> {
    this.account = await this.wallet.getAccount(0);
    this._address = await this.account.getAddress();
    return this._address;
  }

  async getBalances(): Promise<WalletInfo> {
    const [ethBalance, usdtBalance] = await Promise.all([
      this.account.getBalance(),
      this.account.getTokenBalance(CONFIG.mockUsdtAddress),
    ]);

    return {
      address: this._address,
      balanceUsdt: fromUsdtUnits(usdtBalance),
      balanceEth: Number(ethBalance) / 1e18,
    };
  }

  async getUsdtBalance(): Promise<number> {
    const balance = await this.account.getTokenBalance(CONFIG.mockUsdtAddress);
    return fromUsdtUnits(balance);
  }

  /**
   * Transfer USDT to another address.
   * This is the core operation for loan funding and repayment.
   */
  async transferUsdt(to: string, amount: number): Promise<TransferResult> {
    const units = toUsdtUnits(amount);

    // Check balance first
    const balance = await this.account.getTokenBalance(CONFIG.mockUsdtAddress);
    if (balance < units) {
      throw new Error(
        `Insufficient USDT balance. Have ${fromUsdtUnits(balance)}, need ${amount}`
      );
    }

    const result = await this.account.transfer({
      token: CONFIG.mockUsdtAddress,
      recipient: to,
      amount: units,
    });

    return {
      hash: result.hash,
      fee: result.fee,
      amount,
    };
  }

  /**
   * Estimate transfer fee without executing
   */
  async quoteTransfer(to: string, amount: number): Promise<bigint> {
    const units = toUsdtUnits(amount);
    const quote = await this.account.quoteTransfer({
      token: CONFIG.mockUsdtAddress,
      recipient: to,
      amount: units,
    });
    return quote.fee;
  }

  /**
   * Sign a message (for identity verification)
   */
  async signMessage(message: string): Promise<string> {
    return await this.account.sign(message);
  }

  dispose(): void {
    this.account?.dispose();
    this.wallet?.dispose();
  }
}
