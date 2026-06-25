// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** Shared error handling for the desk's API routes. */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { logEvent } from "@/lib/logger";
import { UpstreamError } from "@/lib/preview";

export async function handle(routeName: string, fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const result = await fn();
    return NextResponse.json(result ?? {});
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      logEvent("warning", "upstream_api_error", { status: error.status, route: routeName });
      return NextResponse.json({ error: error.error ?? error.message }, { status: error.status ?? 502 });
    }
    if (error instanceof UpstreamError) {
      logEvent("warning", "upstream_api_error", { status: error.status, route: routeName });
      return NextResponse.json({ error: error.body }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    logEvent("error", "route_error", { route: routeName, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function queryParams(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

/**
 * Guard for state-changing routes on this single-operator console: reject
 * cross-origin browser requests (a malicious page shouldn't be able to make
 * this server spend tokens) and require a JSON content type on POSTs.
 * Returns a response to send when the request should be rejected.
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  // When the browser sends an Origin it must match this server's Host; an
  // absent Origin (curl, direct navigation) is allowed but still has to pass
  // the content-type requirement below.
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "invalid origin" }, { status: 403 });
    }
    if (!host || originHost !== host) {
      return NextResponse.json({ error: "cross-origin requests are not allowed" }, { status: 403 });
    }
  }
  // Requiring JSON on every state-changing method blocks HTML-form CSRF: a
  // cross-origin fetch with this content type triggers a CORS preflight.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ error: "content-type must be application/json" }, { status: 415 });
    }
  }
  return null;
}
