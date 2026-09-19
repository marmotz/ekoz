import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SetReceiptSchema = z.object({
  seq: z
    .string()
    .regex(/^\d+$/, 'Must be a non-negative integer')
    .describe('The room seq, as a decimal string.'),
});
export type SetReceipt = z.infer<typeof SetReceiptSchema>;
export class SetReceiptDto extends createZodDto(SetReceiptSchema) {}
