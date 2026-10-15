interface SortableEmail {
  isStarred?: boolean | null;
  receivedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Keep pinned mail first without mutating the query or retention cache. */
export function sortEmailsWithStarredFirst<T extends SortableEmail>(emails: T[]): T[] {
  return [...emails].sort((a, b) => {
    if (Boolean(a.isStarred) !== Boolean(b.isStarred)) {
      return a.isStarred ? -1 : 1;
    }

    return (
      timestamp(b.receivedAt) - timestamp(a.receivedAt)
      || timestamp(b.createdAt) - timestamp(a.createdAt)
    );
  });
}
