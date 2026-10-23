export function reconcileSocialDraftAfterSave(
  currentDraft: string[],
  draftAtSubmission: readonly string[],
  savedLinks: readonly string[],
): string[] {
  if (
    currentDraft.length !== draftAtSubmission.length ||
    currentDraft.some((link, index) => link !== draftAtSubmission[index])
  ) {
    return currentDraft
  }

  return draftAtSubmission.map((_, index) => savedLinks[index] ?? '')
}
