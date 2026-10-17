import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Shared query client. A failing query shows one toast (instead of a page
 * silently stuck on its loading skeleton); mutations report their own errors.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error): void => {
      // eslint-disable-next-line no-console
      console.error("[query]", error);
      toast.error(`Couldn't load data: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
