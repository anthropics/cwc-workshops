// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** Prompt templates live in prompts/ as Markdown with {placeholder} substitution. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROMPTS_DIR } from "./config";

export function loadPrompt(name: string, substitutions: Record<string, string> = {}): string {
  let text = readFileSync(join(PROMPTS_DIR, name), "utf-8");
  for (const [key, value] of Object.entries(substitutions)) {
    text = text.replaceAll(`{${key}}`, value);
  }
  return text;
}
