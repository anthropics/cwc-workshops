// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { createElement } from "react";
import { registerUnit } from "../core/registry";
import type { TodoItemProps } from "../../features/todos/TodoItem";
import { TodoItem } from "../../features/todos/TodoItem";

const noop = () => {};

registerUnit<TodoItemProps>({
  id: "TodoItem",
  title: "TodoItem",
  description: "A single todo row: checkbox, text, remove button.",
  kind: "component",
  render: (props) => createElement(TodoItem, props),
  fixtures: [
    {
      id: "active",
      description: "An active (not done) todo.",
      props: {
        todo: { id: "t1", text: "Buy milk", done: false, createdAt: 1 },
        onToggle: noop,
        onRemove: noop,
      },
    },
    {
      id: "done",
      description: "A completed todo.",
      props: {
        todo: { id: "t2", text: "Ship it", done: true, createdAt: 2 },
        onToggle: noop,
        onRemove: noop,
      },
    },
    {
      id: "empty-text",
      probe: true,
      description: "Probe: todo with empty text — should render a placeholder, not nothing.",
      props: {
        todo: { id: "t3", text: "", done: false, createdAt: 3 },
        onToggle: noop,
        onRemove: noop,
      },
    },
    {
      id: "long-text",
      probe: true,
      description: "Probe: very long text — should not break layout or the contract.",
      props: {
        todo: {
          id: "t4",
          text: "x".repeat(500),
          done: false,
          createdAt: 4,
        },
        onToggle: noop,
        onRemove: noop,
      },
    },
  ],
  checks: [
    {
      id: "done-attr-matches-prop",
      tag: "contract",
      description: "data-verify-done reflects todo.done",
      check: ({ contract, props }) =>
        contract.done === String(props.todo.done) ||
        `expected done=${props.todo.done}, got "${contract.done}"`,
    },
    {
      id: "done-class-matches",
      description: ".done class present iff todo is done",
      check: ({ root, props }) => {
        const li = root.querySelector("li");
        const has = Boolean(li?.classList.contains("done"));
        return has === props.todo.done || `class mismatch: has=${has}`;
      },
    },
    {
      id: "checkbox-state-matches",
      description: "checkbox checked iff todo is done",
      check: ({ root, props }) => {
        const cb = root.querySelector<HTMLInputElement>("input[type=checkbox]");
        if (!cb) return "no checkbox found";
        return cb.checked === props.todo.done || `checkbox.checked=${cb.checked}`;
      },
    },
    {
      id: "visible-text-never-empty",
      description: "visible text is never empty (falls back to placeholder)",
      check: ({ root }) => {
        const span = root.querySelector(".todo-text");
        return (
          (span?.textContent?.trim().length ?? 0) > 0 ||
          "rendered empty text — no placeholder"
        );
      },
    },
  ],
});
