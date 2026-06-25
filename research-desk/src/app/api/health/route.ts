// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
