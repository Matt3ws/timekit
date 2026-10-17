import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TooltipProvider } from "@/ui/tooltip";
import { Toaster } from "@/ui/sonner";
import { ThemeProvider, initTheme } from "@/lib/theme";
import { initPlatform } from "@/lib/platform";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";
import "./index.css";

initPlatform();
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
