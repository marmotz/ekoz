import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ReadMarkerViewSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  seq: z.string(),
  updatedAt: z.iso.datetime(),
});
export type ReadMarkerView = z.infer<typeof ReadMarkerViewSchema>;
export class ReadMarkerViewDto extends createZodDto(ReadMarkerViewSchema) {}

export interface ReadMarkerRow {
  roomId: string;
  userId: string;
  seq: bigint;
  updatedAt: string;
}

export function toReadMarkerView(row: ReadMarkerRow): ReadMarkerView {
  return {
    roomId: row.roomId,
    userId: row.userId,
    seq: row.seq.toString(),
    updatedAt: row.updatedAt,
  };
}
