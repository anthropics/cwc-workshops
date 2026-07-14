// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

// Side-effect imports: register global checks and unit specs.
import "./verify/checks";
import "./verify/specs";

import { App } from "./App";
import { Dashboard } from "./verify/harness/Dashboard";
import { ReplayPage } from "./verify/harness/ReplayPage";
import { UnitPage } from "./verify/harness/UnitPage";
import { installVerifyHandle } from "./verify/harness/handle";
import "./styles.css";

installVerifyHandle();

const router = createBrowserRouter(
  [
    { path: "/", element: <App /> },
    { path: "/verify", element: <Dashboard /> },
    { path: "/verify/replay", element: <ReplayPage /> },
    { path: "/verify/:unitId/:fixtureId", element: <UnitPage /> },
  ],
  { future: { v7_relativeSplatPath: true } }
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </StrictMode>
);
