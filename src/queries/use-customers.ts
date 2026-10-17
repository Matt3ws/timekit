import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { asc, eq, like, or, sql } from "drizzle-orm";
import { toast } from "sonner";
import { invalidateNames, queryKeys } from "@/queries/keys";
import { db } from "@/db/client";
import { customers, type Customer, type NewCustomer } from "@/db/schema";
import { newId } from "@/lib/ids";
import { PAGE_SIZE } from "@/components/pagination";

export const useCustomers = (): UseQueryResult<Customer[], Error> =>
  useQuery({
    queryKey: queryKeys.customers,
    queryFn: (): Promise<Customer[]> => db.select().from(customers).orderBy(asc(customers.name)),
  });

export interface CustomersQuery {
  page: number;
  search: string;
}

export interface PagedCustomers {
  rows: Customer[];
  total: number;
}

/** Server-side paginated/searched customers for the Customers list page. */
export const usePaginatedCustomers = (query: CustomersQuery): UseQueryResult<PagedCustomers, Error> =>
  useQuery({
    queryKey: [...queryKeys.customers, "page", query],
    queryFn: async (): Promise<PagedCustomers> => {
      const term = query.search.trim();
      const where = term
        ? or(
            like(customers.name, `%${term}%`),
            like(customers.companyName, `%${term}%`),
            like(customers.email, `%${term}%`),
          )
        : undefined;

      const rows = await db
        .select()
        .from(customers)
        .where(where)
        .orderBy(asc(customers.name))
        .limit(PAGE_SIZE)
        .offset((query.page - 1) * PAGE_SIZE);

      const [counted] = await db.select({ total: sql<number>`count(*)` }).from(customers).where(where);
      return { rows, total: Number(counted?.total ?? 0) };
    },
  });

export const useCustomer = (id: string | undefined): UseQueryResult<Customer | undefined, Error> =>
  useQuery({
    queryKey: ["customers", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Customer | undefined> => {
      const rows = await db.select().from(customers).where(eq(customers.id, id!)).limit(1);
      return rows[0];
    },
  });

export const useCreateCustomer = (): UseMutationResult<Customer, Error, NewCustomer> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewCustomer): Promise<Customer> => {
      const [created] = await db
        .insert(customers)
        .values({ ...values, id: values.id ?? newId() })
        .returning();
      return created;
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
    },
    onError: (error: Error): void => {
      toast.error(
        String(error).includes("customers_invoice_code_unique") || String(error).includes("customers.invoice_code")
          ? "That series code is already used by another customer"
          : "Couldn't create customer",
      );
    },
  });
};

export interface UpdateCustomerInput extends Partial<NewCustomer> {
  id: string;
}

export const useUpdateCustomer = (): UseMutationResult<void, Error, UpdateCustomerInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateCustomerInput): Promise<void> => {
      await db
        .update(customers)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(customers.id, id));
    },
    onSuccess: async (): Promise<void> => {
      // The customer's name shows on projects, invoices and the running timer.
      await invalidateNames(queryClient);
      toast.success("Customer saved");
    },
    onError: (error: Error): void => {
      toast.error(
        String(error).includes("customers_invoice_code_unique") || String(error).includes("customers.invoice_code")
          ? "That series code is already used by another customer"
          : "Couldn't save customer",
      );
    },
  });
};

export const useDeleteCustomer = (): UseMutationResult<void, Error, { id: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      await db.delete(customers).where(eq(customers.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
    },
    onError: (): void => {
      toast.error("Couldn't delete customer. It may still have projects.");
    },
  });
};
