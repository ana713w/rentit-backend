import { z } from "zod";

export const promoteSchema = z.object({
  userId: z.number().int().positive(),
});