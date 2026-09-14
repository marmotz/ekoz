import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';
import { AccountViewSchema, accountStatusSchema } from './account.view.js';

/** `GET /admin/users` query params (technical.md §2.1, issue #14). */
export const AdminUserListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: accountStatusSchema.optional(),
  owner: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  cursor: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;
export class AdminUserListQueryDto extends createZodDto(AdminUserListQuerySchema) {}

/** `AccountView` plus the admin-only fields (owner context). */
export const AdminUserListItemSchema = AccountViewSchema.extend({
  createdAt: z.iso.datetime(),
  suspendedAt: z.iso.datetime().nullable(),
  suspendedReason: nullableString(),
});
export type AdminUserListItem = z.infer<typeof AdminUserListItemSchema>;
export class AdminUserListItemDto extends createZodDto(AdminUserListItemSchema) {}

/** `GET /admin/users` response. */
export const AdminUserListResponseSchema = z.object({
  items: z.array(AdminUserListItemSchema),
  nextCursor: nullableString(),
});
export type AdminUserListResponse = z.infer<typeof AdminUserListResponseSchema>;
export class AdminUserListResponseDto extends createZodDto(AdminUserListResponseSchema) {}

/** `GET /admin/users/:id` response: the list item plus verification + session state. */
export const AdminUserDetailSchema = AdminUserListItemSchema.extend({
  emailVerifiedAt: z.iso.datetime().nullable(),
  activeSessionCount: z.int().min(0),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;
export class AdminUserDetailDto extends createZodDto(AdminUserDetailSchema) {}

export const AdminUserIdParamSchema = z.object({ id: entityIdSchema });
