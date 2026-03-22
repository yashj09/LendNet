export function formatAddress(address: string, visible: number = 8): string {
  if (!address || address.length <= visible * 2) return address;
  return `${address.slice(0, visible)}...${address.slice(-visible)}`;
}

export function logBootBanner(): void {
  logSection("LendNet Boot", [
    "P2P Agent Lending Network",
    "Autonomous AI agents lending USDT via WDK",
  ]);
}

export function logSection(title: string, lines: string[]): void {
  const width = Math.max(
    title.length + 4,
    ...lines.map((line) => line.length + 4),
  );
  const border = "=".repeat(width);

  console.log(border);
  console.log(`= ${title.padEnd(width - 4)} =`);
  console.log(border);

  for (const line of lines) {
    console.log(`  ${line}`);
  }

  console.log("");
}

export function logList(title: string, items: Array<[string, string]>): void {
  const labelWidth = Math.max(...items.map(([label]) => label.length), 0);
  console.log(`[${title}]`);
  for (const [label, value] of items) {
    console.log(`  ${label.padEnd(labelWidth)} : ${value}`);
  }
  console.log("");
}

const STARTUP_NOISE_PATTERNS = [
  "[@gelatonetwork/relay-sdk]",
  "[Aave] Patched Sepolia addresses into WDK Aave module",
];

export async function withMutedStartupNoise<T>(
  action: () => Promise<T>,
): Promise<T> {
  const originalWarn = console.warn;
  const originalLog = console.log;

  const shouldMute = (value: unknown): boolean => {
    const text = String(value ?? "");
    return STARTUP_NOISE_PATTERNS.some((pattern) => text.includes(pattern));
  };

  console.warn = (...args: unknown[]) => {
    if (args.some(shouldMute)) return;
    originalWarn(...args);
  };

  console.log = (...args: unknown[]) => {
    if (args.some(shouldMute)) return;
    originalLog(...args);
  };

  try {
    return await action();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}
