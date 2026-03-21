import { CONFIG } from '../config/index.js';
import type {
  AgentProfile,
  CreditReport,
  CreditFactor,
  WalletMetrics,
} from '../config/types.js';

/**
 * On-chain credit scoring engine for AI agents.
 * Evaluates creditworthiness based on wallet history and lending reputation.
 */
export class CreditScorer {
  /**
   * Generate a full credit report for an agent.
   */
  score(agent: AgentProfile, walletMetrics: WalletMetrics): CreditReport {
    const factors: CreditFactor[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // Factor 1: Repayment History (35% weight — largest factor, like FICO)
    const repaymentScore = this.scoreRepaymentHistory(agent, factors);
    totalScore += repaymentScore * 0.35;
    totalWeight += 0.35;

    // Factor 2: Wallet Balance / Capacity (30% weight)
    const balanceScore = this.scoreWalletBalance(walletMetrics, factors);
    totalScore += balanceScore * 0.30;
    totalWeight += 0.30;

    // Factor 3: Wallet Age & Activity (15% weight)
    const ageScore = this.scoreWalletAge(walletMetrics, factors);
    totalScore += ageScore * 0.15;
    totalWeight += 0.15;

    // Factor 4: Lending Volume / Experience (10% weight)
    const volumeScore = this.scoreLendingVolume(agent, factors);
    totalScore += volumeScore * 0.10;
    totalWeight += 0.10;

    // Factor 5: Default Rate (10% weight — penalty factor)
    const defaultScore = this.scoreDefaultRate(agent, factors);
    totalScore += defaultScore * 0.10;
    totalWeight += 0.10;

    // Normalize to 300-850 range
    const normalizedScore = Math.round(
      CONFIG.minCreditScore +
        (totalScore / totalWeight) *
          (CONFIG.maxCreditScore - CONFIG.minCreditScore)
    );

    const score = Math.max(
      CONFIG.minCreditScore,
      Math.min(CONFIG.maxCreditScore, normalizedScore)
    );

    const riskLevel = this.getRiskLevel(score);
    const recommendedCollateral = this.getRecommendedCollateral(score);
    const maxLoanAmount = this.getMaxLoanAmount(score, walletMetrics.balanceUsdt);

    return {
      agentId: agent.id,
      score,
      riskLevel,
      factors,
      walletMetrics,
      recommendedCollateral,
      maxLoanAmount,
    };
  }

  private scoreRepaymentHistory(
    agent: AgentProfile,
    factors: CreditFactor[]
  ): number {
    const { successfulRepayments, defaults } = agent.reputation;
    const total = successfulRepayments + defaults;

    if (total === 0) {
      factors.push({
        name: 'Repayment History',
        impact: 'neutral',
        description: 'No lending history — new agent',
        weight: 0.35,
      });
      return 0.5; // neutral for new agents
    }

    const successRate = successfulRepayments / total;
    const impact = successRate >= 0.9 ? 'positive' : successRate >= 0.7 ? 'neutral' : 'negative';

    factors.push({
      name: 'Repayment History',
      impact,
      description: `${successfulRepayments}/${total} loans repaid on time (${(successRate * 100).toFixed(0)}%)`,
      weight: 0.35,
    });

    return successRate;
  }

  private scoreWalletBalance(
    metrics: WalletMetrics,
    factors: CreditFactor[]
  ): number {
    const balance = metrics.balanceUsdt;
    // Score based on balance tiers
    let score: number;
    if (balance >= 10000) score = 1.0;
    else if (balance >= 5000) score = 0.85;
    else if (balance >= 1000) score = 0.7;
    else if (balance >= 100) score = 0.5;
    else if (balance >= 10) score = 0.3;
    else score = 0.1;

    const impact = score >= 0.7 ? 'positive' : score >= 0.4 ? 'neutral' : 'negative';

    factors.push({
      name: 'Wallet Balance',
      impact,
      description: `Current USDT balance: ${balance.toFixed(2)}`,
      weight: 0.30,
    });

    return score;
  }

  private scoreWalletAge(
    metrics: WalletMetrics,
    factors: CreditFactor[]
  ): number {
    const ageDays = metrics.walletAgeDays;
    let score: number;
    if (ageDays >= 365) score = 1.0;
    else if (ageDays >= 180) score = 0.8;
    else if (ageDays >= 90) score = 0.6;
    else if (ageDays >= 30) score = 0.4;
    else score = 0.2;

    const impact = score >= 0.6 ? 'positive' : score >= 0.3 ? 'neutral' : 'negative';

    factors.push({
      name: 'Wallet Age & Activity',
      impact,
      description: `Wallet age: ${ageDays} days, ${metrics.transactionCount} transactions`,
      weight: 0.15,
    });

    return score;
  }

  private scoreLendingVolume(
    agent: AgentProfile,
    factors: CreditFactor[]
  ): number {
    const totalVolume =
      agent.reputation.totalVolumeLent + agent.reputation.totalVolumeBorrowed;
    let score: number;
    if (totalVolume >= 50000) score = 1.0;
    else if (totalVolume >= 10000) score = 0.8;
    else if (totalVolume >= 1000) score = 0.6;
    else if (totalVolume >= 100) score = 0.3;
    else score = 0.1;

    const impact = score >= 0.6 ? 'positive' : 'neutral';

    factors.push({
      name: 'Lending Experience',
      impact,
      description: `Total volume: $${totalVolume.toFixed(2)} across ${
        agent.reputation.totalLoansIssued + agent.reputation.totalLoansBorrowed
      } loans`,
      weight: 0.10,
    });

    return score;
  }

  private scoreDefaultRate(
    agent: AgentProfile,
    factors: CreditFactor[]
  ): number {
    const { defaults, successfulRepayments } = agent.reputation;
    const total = defaults + successfulRepayments;

    if (total === 0) {
      factors.push({
        name: 'Default Rate',
        impact: 'neutral',
        description: 'No history',
        weight: 0.10,
      });
      return 0.5;
    }

    const defaultRate = defaults / total;
    const score = 1 - defaultRate; // lower defaults = higher score

    const impact = defaultRate === 0 ? 'positive' : defaultRate <= 0.1 ? 'neutral' : 'negative';

    factors.push({
      name: 'Default Rate',
      impact,
      description: `${defaults} defaults out of ${total} loans (${(defaultRate * 100).toFixed(1)}%)`,
      weight: 0.10,
    });

    return score;
  }

  private getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' {
    if (score >= 750) return 'LOW';
    if (score >= 650) return 'MEDIUM';
    if (score >= 500) return 'HIGH';
    return 'VERY_HIGH';
  }

  private getRecommendedCollateral(score: number): number {
    if (score >= 800) return 0;    // No collateral needed — excellent credit
    if (score >= 750) return 20;
    if (score >= 700) return 40;
    if (score >= 650) return 60;
    if (score >= 550) return 80;
    return 100; // Full collateral for poor credit
  }

  private getMaxLoanAmount(score: number, balance: number): number {
    // Max loan is a multiple of balance based on credit score
    if (score >= 800) return balance * 5;
    if (score >= 750) return balance * 3;
    if (score >= 700) return balance * 2;
    if (score >= 650) return balance * 1.5;
    if (score >= 550) return balance * 1;
    return balance * 0.5;
  }
}
