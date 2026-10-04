import { z } from "zod";

export const promoteSchema = z.object({
  email: z.string().trim().email("Invalid email"),
});
