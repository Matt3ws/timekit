import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { AppLayout } from "@/app-layout";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ProjectsPage } from "@/features/projects/projects-page";
import { ProjectDetailPage } from "@/features/projects/project-detail-page";
import { CustomersPage } from "@/features/customers/customers-page";
import { InvoicesPage } from "@/features/invoices/invoices-page";
import { BookkeepingPage } from "@/features/bookkeeping/bookkeeping-page";
import { SubscriptionsPage } from "@/features/subscriptions/subscriptions-page";
import { SettingsPage } from "@/features/settings/settings-page";

const NotFound = (): React.JSX.Element => (
  <div className="py-24 text-center">
    <p className="text-lg font-medium">Page not found</p>
    <Link to="/" className="mt-2 inline-block text-sm text-muted-foreground hover:text-foreground">
      ← Back to the dashboard
    </Link>
  </div>
);

const RouteError = ({ error }: ErrorComponentProps): React.JSX.Element => (
  <div className="py-24 text-center">
    <p className="text-lg font-medium">Something went wrong</p>
    <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
    <Link to="/" className="mt-3 inline-block text-sm text-muted-foreground hover:text-foreground">
      ← Back to the dashboard
    </Link>
  </div>
);

const rootRoute = createRootRoute({
  component: AppLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage });
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});
const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectDetailPage,
});
const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers",
  component: CustomersPage,
});
/** `?newFor=<customerId>` opens New invoice for that customer (the subscription reminder links here). */
export interface InvoicesSearch {
  newFor?: string;
}

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invoices",
  component: InvoicesPage,
  validateSearch: (search: Record<string, unknown>): InvoicesSearch => ({
    newFor: typeof search.newFor === "string" ? search.newFor : undefined,
  }),
});
const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subscriptions",
  component: SubscriptionsPage,
});
const bookkeepingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bookkeeping",
  component: BookkeepingPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  projectDetailRoute,
  customersRoute,
  invoicesRoute,
  subscriptionsRoute,
  bookkeepingRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
