import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserSummarySchema } from '../../../core/users/user-summary.js';

export const CONTACTS_MIN_QUERY_LENGTH = 2;
export const CONTACTS_MAX_QUERY_LENGTH = 100;

export const ContactsQuerySchema = z.object({
  query: z.string().trim().min(CONTACTS_MIN_QUERY_LENGTH).max(CONTACTS_MAX_QUERY_LENGTH),
});
export type ContactsQuery = z.infer<typeof ContactsQuerySchema>;
export class ContactsQueryDto extends createZodDto(ContactsQuerySchema) {}

export const ContactsResponseSchema = z.object({ items: z.array(UserSummarySchema) });
export type ContactsResponse = z.infer<typeof ContactsResponseSchema>;
export class ContactsResponseDto extends createZodDto(ContactsResponseSchema) {}
