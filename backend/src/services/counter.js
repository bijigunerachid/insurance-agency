/**
 * Next value of a gapless counter. Must run inside the transaction that uses the number:
 * the row stays locked until commit, and a rollback undoes the increment (no gap).
 */
export async function nextCounterValue(tx, type, year = 0) {
  const [row] = await tx.$queryRaw`
    INSERT INTO counter (type, year, value) VALUES (${type}, ${year}, 1)
    ON CONFLICT (type, year) DO UPDATE SET value = counter.value + 1
    RETURNING value`;
  return row.value;
}
