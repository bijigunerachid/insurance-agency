import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

export const paginationFields = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
};

export function toSkipTake({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult(items, total, { page, pageSize }) {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
