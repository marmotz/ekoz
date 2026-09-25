import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserSummarySchema } from '../../../core/users/user-summary.js';

/** A room group, as seen from a given room (web-client-mentions technical.md S4). */
export const GroupSummarySchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  name: z.string(),
  memberCount: z.number().int().min(0),
  inherited: z.boolean(),
  isMember: z.boolean(),
});
export type GroupSummary = z.infer<typeof GroupSummarySchema>;
export class GroupSummaryDto extends createZodDto(GroupSummarySchema) {}

export const GroupListViewSchema = z.object({ items: z.array(GroupSummarySchema) });
export type GroupListView = z.infer<typeof GroupListViewSchema>;
export class GroupListViewDto extends createZodDto(GroupListViewSchema) {}

export const GroupDetailSchema = GroupSummarySchema.extend({
  members: z.array(UserSummarySchema),
});
export type GroupDetail = z.infer<typeof GroupDetailSchema>;
export class GroupDetailDto extends createZodDto(GroupDetailSchema) {}

export interface GroupRow {
  id: string;
  nodeId: string;
  name: string;
  createdById: string;
  createdAt: string;
}
