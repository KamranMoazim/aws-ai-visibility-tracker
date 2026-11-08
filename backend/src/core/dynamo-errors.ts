export function isConditionFailure(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  if (name === 'ConditionalCheckFailedException') {
    return true;
  }
  if (name === 'TransactionCanceledException') {
    const reasons =
      (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
    return reasons.some((reason) => reason.Code === 'ConditionalCheckFailed');
  }
  return false;
}

const CONFLICT_ATTEMPTS = 6;

export function isTransactionConflict(error: unknown): boolean {
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return (
    (error as { name?: string }).name === 'TransactionCanceledException' &&
    Boolean(reasons?.some((reason) => reason.Code === 'TransactionConflict')) &&
    !reasons?.some((reason) => reason.Code === 'ConditionalCheckFailed')
  );
}

export async function retryOnConflict<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransactionConflict(error) || attempt >= CONFLICT_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 * 2 ** attempt));
    }
  }
}
