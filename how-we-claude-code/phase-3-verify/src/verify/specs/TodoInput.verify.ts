// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { createElement } from "react";
import { registerUnit } from "../core/registry";
import type { TodoInputProps } from "../../features/todos/TodoInput";
import { TodoInput } from "../../features/todos/TodoInput";

const noop = () => {};

registerUnit<TodoInputProps>({
  id: "TodoInput",
  title: "TodoInput",
  description: "The add-todo form: text input + submit button.",
  kind: "component",
  render: (props) => createElement(TodoInput, props),
  fixtures: [
    {
      id: "empty",
      description: "Initial state — nothing typed.",
      props: { onAdd: noop },
    },
    {
      id: "typed",
      description: "User has typed some text.",
      props: { onAdd: noop },
      act: async (ctx) => {
        await ctx.type("input[type=text]", "Buy oat milk");
      },
    },
    {
      id: "whitespace-only",
      probe: true,
      description: "Probe: only whitespace typed — submit must stay disabled.",
      props: { onAdd: noop },
      act: async (ctx) => {
        await ctx.type("input[type=text]", "   ");
      },
    },
  ],
  checks: [
    {
      id: "submit-disabled-iff-empty",
      description: "submit button disabled iff trimmed value is empty",
      check: ({ root, contract }) => {
        const btn = root.querySelector<HTMLButtonElement>("button[type=submit]");
        if (!btn) return "no submit button";
        const shouldBeEnabled = contract["can-submit"] === "true";
        return (
          btn.disabled === !shouldBeEnabled ||
          `disabled=${btn.disabled} but can-submit=${contract["can-submit"]}`
        );
      },
    },
    {
      id: "contract-value-matches-input",
      description: "data-verify-value mirrors the live input value",
      check: ({ root, contract }) => {
        const input = root.querySelector<HTMLInputElement>("input[type=text]");
        if (!input) return "no input";
        return (
          input.value === (contract.value ?? "") ||
          `input="${input.value}" contract="${contract.value}"`
        );
      },
    },
  ],
});
