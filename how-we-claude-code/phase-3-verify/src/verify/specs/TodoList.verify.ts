// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { createElement } from "react";
import { registerUnit } from "../core/registry";
import type { TodoListProps } from "../../features/todos/TodoList";
import { TodoList } from "../../features/todos/TodoList";
import type { Todo } from "../../features/todos/types";

const noop = () => {};

const mixed: Todo[] = [
  { id: "t1", text: "Write the report", done: true, createdAt: 1 },
  { id: "t2", text: "Review the PR", done: false, createdAt: 2 },
  { id: "t3", text: "Buy milk", done: false, createdAt: 3 },
];

const allDone: Todo[] = [
  { id: "d1", text: "Done one", done: true, createdAt: 1 },
  { id: "d2", text: "Done two", done: true, createdAt: 2 },
];

registerUnit<TodoListProps>({
  id: "TodoList",
  title: "TodoList",
  description: "Renders todos as a list, or an empty state.",
  kind: "component",
  render: (props) => createElement(TodoList, props),
  fixtures: [
    {
      id: "empty",
      description: "No todos — shows the empty state.",
      props: { todos: [], onToggle: noop, onRemove: noop },
    },
    {
      id: "populated",
      description: "Three todos, mixed state.",
      props: { todos: mixed, onToggle: noop, onRemove: noop },
    },
    {
      id: "all-done",
      description: "Every todo done — should still render each row.",
      props: { todos: allDone, onToggle: noop, onRemove: noop },
    },
    {
      id: "long-text",
      probe: true,
      description:
        "Probe: one todo with 200-char text. Should render without breaking the contract.",
      props: {
        todos: [
          { id: "bt1", text: "x".repeat(200), done: false, createdAt: 10 },
          { id: "bt2", text: "short", done: true, createdAt: 11 },
        ],
        onToggle: noop,
        onRemove: noop,
      },
    },
  ],
  checks: [
    {
      id: "contract-count-matches",
      tag: "contract",
      description: "data-verify-count equals props.todos.length",
      check: ({ contract, props }) =>
        contract.count === String(props.todos.length) ||
        `contract count=${contract.count}, expected ${props.todos.length}`,
    },
    {
      id: "rendered-items-match",
      description: "rendered <li.todo-item> count equals props.todos.length",
      check: ({ root, props }) => {
        const lis = root.querySelectorAll("li.todo-item").length;
        return (
          lis === props.todos.length ||
          `rendered ${lis} items, expected ${props.todos.length}`
        );
      },
    },
    {
      id: "empty-state-present",
      description: "empty fixture shows a placeholder, not a blank list",
      onlyFixtures: ["empty"],
      check: ({ root }) =>
        root.querySelector(".todo-empty") !== null ||
        "empty fixture should render .todo-empty",
    },
    {
      id: "each-todo-has-contract",
      description: "every rendered todo <li> carries its own contract",
      check: ({ root, props }) => {
        if (props.todos.length === 0) return true;
        const lis = Array.from(
          root.querySelectorAll<HTMLElement>("li.todo-item")
        );
        if (lis.length === 0) return "no li.todo-item rendered";
        const missing = lis.filter((li) => !li.hasAttribute("data-verify-unit"));
        return (
          missing.length === 0 ||
          `${missing.length}/${lis.length} items missing data-verify-unit`
        );
      },
    },
  ],
});
