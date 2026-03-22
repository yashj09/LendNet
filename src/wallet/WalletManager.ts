import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';
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

export interface AavePosition {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}

export interface AaveActionResult {
  hash: string;
  fee: bigint;
}

// Patch AaveProtocolEvm's address map to include Sepolia testnet
// The WDK module only ships mainnet chains, but we need Sepolia for testnet
function patchAaveSepoliaAddresses() {
  try {
    // The WDK Aave module's exports field blocks direct subpath imports.
    // Use createRequire with absolute path to bypass the exports restriction.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const esmRequire = createRequire(import.meta.url);
    const absPath = resolve(__dirname, '../../node_modules/@tetherto/wdk-protocol-lending-aave-evm/src/aave-v3-address-map.js');
    const addressMapModule = esmRequire(absPath);
    const map: Record<string, any> = addressMapModule.default || addressMapModule;
    const sepoliaAddresses = {
      pool: CONFIG.aavePoolAddress,
      uiPoolDataProvider: CONFIG.aaveUiPoolDataProvider,
      poolAddressesProvider: CONFIG.aavePoolAddressesProvider,
      priceOracle: CONFIG.aaveOracle,
    };
    // ethers getNetwork() returns bigint chainId, JS converts bigint keys to strings
    // so map[11155111n] actually accesses map["11155111"]
    if (!map['11155111']) {
      map['11155111'] = sepoliaAddresses;
      console.log('[Aave] Patched Sepolia addresses into WDK Aave module');
    }
  } catch (e: any) {
    console.log(`[Aave] Could not patch address map: ${e.message}`);
  }
}

// Run patch on module load
patchAaveSepoliaAddresses();

/**
 * Wraps Tether WDK for agent wallet operations on Sepolia testnet.
 * Each agent gets its own WalletManager instance with a unique seed.
 * Includes Aave V3 protocol integration for on-chain lending operations.
 */
export class AgentWalletManager {
  private wallet: InstanceType<typeof WalletManagerEvm>;
  private account: any; // WalletAccountEvm
  private aave: InstanceType<typeof AaveProtocolEvm> | null = null;
  private _address: string = '';
  private _seed: string;

  constructor(seedPhrase: string) {
    this._seed = seedPhrase;
    this.wallet = new WalletManagerEvm(seedPhrase, {
      provider: CONFIG.rpcUrl,
      transferMaxFee: 5000000000000000n, // 0.005 ETH max fee (reasonable for Sepolia)
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

    // Initialize Aave protocol with this account
    try {
      this.aave = new AaveProtocolEvm(this.account);
      console.log(`[Aave] Protocol initialized for wallet ${this._address.slice(0, 10)}...`);
    } catch (e: any) {
      console.log(`[Aave] Protocol init failed (non-critical): ${e.message}`);
    }

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

  async getAaveUsdtBalance(): Promise<number> {
    const balance = await this.account.getTokenBalance(CONFIG.aaveUsdtAddress);
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

  // ─── Aave V3 Protocol Operations ────────────────────────

  private assertAave(): InstanceType<typeof AaveProtocolEvm> {
    if (!this.aave) throw new Error('Aave protocol not initialized');
    return this.aave;
  }

  /**
   * Approve Aave Pool to spend USDT tokens.
   * Required before supply() and repay() operations.
   */
  async approveAave(amount: number): Promise<AaveActionResult> {
    const units = toUsdtUnits(amount);
    const result = await this.account.approve({
      token: CONFIG.aaveUsdtAddress,
      spender: CONFIG.aavePoolAddress,
      amount: units,
    });
    console.log(`[Aave] Approved ${amount} USDT for Pool — tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee };
  }

  /**
   * Supply USDT to Aave V3 lending pool.
   * Lenders use this to earn yield on idle capital.
   * Returns real on-chain tx hash.
   */
  async supplyToAave(amount: number): Promise<AaveActionResult> {
    const aave = this.assertAave();
    const units = toUsdtUnits(amount);

    // Approve Aave Pool to spend tokens first
    await this.approveAave(amount);

    const result = await aave.supply({
      token: CONFIG.aaveUsdtAddress,
      amount: units,
    });

    console.log(`[Aave] Supplied ${amount} USDT — tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee };
  }

  /**
   * Withdraw USDT from Aave V3 lending pool.
   * Lenders use this to pull funds out to fund a loan.
   * Returns real on-chain tx hash.
   */
  async withdrawFromAave(amount: number): Promise<AaveActionResult> {
    const aave = this.assertAave();
    const units = toUsdtUnits(amount);

    const result = await aave.withdraw({
      token: CONFIG.aaveUsdtAddress,
      amount: units,
    });

    console.log(`[Aave] Withdrew ${amount} USDT — tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee };
  }

  /**
   * Borrow USDT from Aave V3 against supplied collateral.
   */
  async borrowFromAave(amount: number): Promise<AaveActionResult> {
    const aave = this.assertAave();
    const units = toUsdtUnits(amount);

    const result = await aave.borrow({
      token: CONFIG.aaveUsdtAddress,
      amount: units,
    });

    console.log(`[Aave] Borrowed ${amount} USDT — tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee };
  }

  /**
   * Repay USDT debt to Aave V3.
   */
  async repayToAave(amount: number): Promise<AaveActionResult> {
    const aave = this.assertAave();
    const units = toUsdtUnits(amount);

    // Approve Aave Pool to pull tokens
    await this.approveAave(amount);

    const result = await aave.repay({
      token: CONFIG.aaveUsdtAddress,
      amount: units,
    });

    console.log(`[Aave] Repaid ${amount} USDT — tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee };
  }

  /**
   * Get Aave V3 account position data.
   * Returns collateral, debt, health factor, etc.
   */
  async getAavePosition(): Promise<AavePosition | null> {
    try {
      const aave = this.assertAave();
      return await aave.getAccountData();
    } catch {
      return null;
    }
  }

  /**
   * Enable/disable a token as collateral in Aave.
   */
  async setAaveCollateral(useAsCollateral: boolean): Promise<AaveActionResult> {
    const aave = this.assertAave();
    const result = await aave.setUseReserveAsCollateral(
      CONFIG.aaveUsdtAddress,
      useAsCollateral
    );
    console.log(`[Aave] Collateral ${useAsCollateral ? 'enabled' : 'disabled'} — tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee };
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
