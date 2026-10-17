import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { toast } from "sonner";
import { db } from "@/db/client";
import { settings, type Settings, type NewSettings } from "@/db/schema";

const SETTINGS_ID = "default";

/** Reads the single settings row, seeding it on first run. Safe to call outside React. */
export const getSettingsRow = async (): Promise<Settings> => {
  const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
  if (rows[0]) {
    return rows[0];
  }
  const [created] = await db.insert(settings).values({ id: SETTINGS_ID }).returning();
  return created;
};

/** Reads the single settings row, seeding it on first run. */
export const useSettings = (): UseQueryResult<Settings, Error> =>
  useQuery({
    queryKey: ["settings"],
    queryFn: (): Promise<Settings> => getSettingsRow(),
  });

export const useUpdateSettings = (): UseMutationResult<void, Error, Partial<NewSettings>> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<NewSettings>): Promise<void> => {
      await db
        .update(settings)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(settings.id, SETTINGS_ID));
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    },
    onError: (): void => {
      toast.error("Couldn't save settings");
    },
  });
};
