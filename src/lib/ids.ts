import { createId } from "@paralleldrive/cuid2";

/** Generate a collision-resistant id for a new row. */
export const newId = (): string => createId();
