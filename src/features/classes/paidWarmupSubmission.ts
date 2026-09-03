export type SubmissionLock = {
  current: boolean;
};

export function createPaidWarmupSubmissionId(
  existingId?: string,
  generateId: () => string = () => crypto.randomUUID(),
) {
  return existingId || generateId();
}

export async function savePaidWarmupWithRefresh<T>({
  save,
  refresh,
  onSaveSuccess,
  onRefreshError,
}: {
  save: () => Promise<T>;
  refresh: () => Promise<boolean | void>;
  onSaveSuccess: (saved: T) => void;
  onRefreshError: (error?: unknown) => void;
}) {
  const saved = await save();
  onSaveSuccess(saved);

  let refreshed: boolean | void;
  try {
    refreshed = await refresh();
  } catch (error) {
    onRefreshError(error);
    return saved;
  }

  if (refreshed === false) {
    onRefreshError();
  }

  return saved;
}

export async function runPaidWarmupSubmission({
  lock,
  onSaveError,
  onSaved,
  onSavingChange,
  save,
}: {
  lock: SubmissionLock;
  onSaveError: (error: unknown) => void;
  onSaved?: () => void;
  onSavingChange: (saving: boolean) => void;
  save: () => Promise<void>;
}): Promise<"saved" | "failed" | "ignored"> {
  if (lock.current) {
    return "ignored";
  }

  lock.current = true;
  onSavingChange(true);

  try {
    try {
      await save();
    } catch (error) {
      onSaveError(error);
      return "failed";
    }

    onSaved?.();
    return "saved";
  } finally {
    lock.current = false;
    onSavingChange(false);
  }
}
