/**
 * User Credit & Billing Management
 * Implements atomic credit validation and deduction.
 */

// In-memory atomic store for anonymous / demo sessions when persistent DB is offline
const memoryBalances = new Map<string, number>();

export async function checkAndDeductCredits(
  userId: string,
  requiredCredits: number
): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  // If user has no balance recorded yet, default to an initial allotment (e.g. 5 credits)
  // or unlimited demo allowance for development.
  const currentBalance = memoryBalances.has(userId)
    ? (memoryBalances.get(userId) as number)
    : 10;

  if (currentBalance < requiredCredits) {
    return {
      success: false,
      remainingCredits: currentBalance,
      error: `Insufficient credits. Required: ${requiredCredits}, Available: ${currentBalance}`,
    };
  }

  // Atomic deduction
  const newBalance = currentBalance - requiredCredits;
  memoryBalances.set(userId, newBalance);

  return {
    success: true,
    remainingCredits: newBalance,
  };
}

export function getUserCredits(userId: string): number {
  return memoryBalances.has(userId) ? (memoryBalances.get(userId) as number) : 10;
}
