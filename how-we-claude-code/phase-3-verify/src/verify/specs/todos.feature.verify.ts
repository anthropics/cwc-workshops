// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { createElement } from "react";
import { registerUnit } from "../core/registry";
import type { TodoAppProps } from "../../features/todos/TodoApp";
import { TodoApp } from "../../features/todos/TodoApp";
import type { Todo } from "../../features/todos/types";

const seeded: Todo[] = [
  { id: "s1", text: "Read docs", done: true, createdAt: 1 },
  { id: "s2", text: "Write tests", done: false, createdAt: 2 },
  { id: "s3", text: "Ship it", done: true, createdAt: 3 },
];

/**
 * Feature-slice unit: the whole todo app with real state.
 *
 * Component-level specs verify each piece in isolation. This spec verifies
 * *coordination*: adding a todo updates both list AND stats; filtering hides
 * the right items; the contracts of child components stay mutually consistent.
 * Fixtures here lean on `act()` — render, then drive the surface.
 */
registerUnit<TodoAppProps>({
  id: "todos.feature",
  title: "Todo App (feature)",
  description: "The whole app with real state — cross-component coordination.",
  kind: "feature",
  render: (props) => createElement(TodoApp, props),
  fixtures: [
    {
      id: "fresh",
      description: "Fresh app, no todos.",
      props: {},
    },
    {
      id: "pre-seeded",
      description: "Seeded with 3 todos, 2 done.",
      props: { initial: seeded },
    },
    {
      id: "add-then-verify",
      description: "Type a todo, submit, expect it to appear.",
      props: {},
      act: async (ctx) => {
        await ctx.type("input[type=text]", "Write a verifier");
        await ctx.click("button[type=submit]");
        await ctx.wait(16);
      },
    },
    {
      id: "add-then-toggle",
      description: "Add a todo, mark it done.",
      props: {},
      act: async (ctx) => {
        await ctx.type("input[type=text]", "Ship it");
        await ctx.click("button[type=submit]");
        await ctx.wait(16);
        await ctx.click("li.todo-item input[type=checkbox]");
        await ctx.wait(16);
      },
    },
    {
      id: "filter-active",
      probe: true,
      description:
        "Probe: pre-seeded, click the Active filter. Done items must vanish from the visible list while total stays constant.",
      props: { initial: seeded },
      act: async (ctx) => {
        const btns = Array.from(
          ctx.root.querySelectorAll<HTMLElement>(".todo-filters button")
        );
        btns.find((b) => b.textContent?.trim() === "active")?.click();
        await ctx.wait(16);
      },
    },
    {
      id: "whitespace-submit",
      probe: true,
      description:
        "Probe: type whitespace, submit. Count must NOT change — form must block it.",
      props: {},
      act: async (ctx) => {
        await ctx.type("input[type=text]", "   ");
        // Try to submit anyway.
        const form = ctx.root.querySelector("form");
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await ctx.wait(16);
      },
    },
  ],
  checks: [
    {
      id: "app-has-contract",
      tag: "contract",
      description: "app root emits data-verify-unit='TodoApp'",
      check: ({ contract }) =>
        contract.unit === "TodoApp" ||
        `root contract unit="${contract.unit}", expected "TodoApp"`,
    },
    {
      id: "counts-add-up",
      description: "app contract: total === done + active",
      check: ({ contract }) => {
        const total = Number(contract.total);
        const done = Number(contract.done);
        const active = Number(contract.active);
        return (
          total === done + active ||
          `total=${total} !== done=${done} + active=${active}`
        );
      },
    },
    {
      id: "visible-matches-filter",
      description: "visible count is consistent with filter",
      check: ({ contract }) => {
        const visible = Number(contract.visible);
        const total = Number(contract.total);
        const active = Number(contract.active);
        const done = Number(contract.done);
        if (contract.filter === "all")
          return visible === total || `filter=all but visible=${visible}, total=${total}`;
        if (contract.filter === "active")
          return visible === active || `filter=active but visible=${visible}, active=${active}`;
        return visible === done || `filter=done but visible=${visible}, done=${done}`;
      },
    },
    {
      id: "rendered-items-match-visible",
      description: "rendered <li.todo-item> count equals contract.visible",
      check: ({ root, contract }) => {
        const lis = root.querySelectorAll("li.todo-item").length;
        return (
          lis === Number(contract.visible) ||
          `rendered ${lis} items, contract visible=${contract.visible}`
        );
      },
    },
    {
      id: "child-stats-consistent-with-app",
      description: "TodoStats contract agrees with TodoApp contract",
      check: ({ root, contract }) => {
        const stats = root.querySelector<HTMLElement>(
          '[data-verify-unit="TodoStats"]'
        );
        if (!stats) return "no TodoStats rendered";
        const sTotal = stats.getAttribute("data-verify-total");
        return (
          sTotal === contract.total ||
          `TodoStats total=${sTotal} disagrees with TodoApp total=${contract.total}`
        );
      },
    },
    {
      id: "fresh-shows-empty-state",
      description: "fresh app shows empty placeholder",
      onlyFixtures: ["fresh"],
      check: ({ root }) =>
        root.querySelector(".todo-empty") !== null ||
        "fresh app should show .todo-empty",
    },
    {
      id: "added-todo-appears",
      description: "after adding a todo, count is 1 and text appears",
      onlyFixtures: ["add-then-verify"],
      check: ({ root, contract }) => {
        if (contract.total !== "1")
          return `expected total=1 after add, got ${contract.total}`;
        const text = root.querySelector(".todo-text")?.textContent;
        return (
          text === "Write a verifier" || `rendered text was "${text}"`
        );
      },
    },
    {
      id: "toggle-marks-done",
      description: "after add+toggle, done=1",
      onlyFixtures: ["add-then-toggle"],
      check: ({ contract }) =>
        contract.done === "1" ||
        `expected done=1 after toggle, got ${contract.done}`,
    },
    {
      id: "whitespace-blocked",
      description: "submitting whitespace must not create a todo",
      onlyFixtures: ["whitespace-submit"],
      check: ({ contract }) =>
        contract.total === "0" ||
        `whitespace submit created a todo! total=${contract.total}`,
    },
    {
      id: "active-filter-hides-done",
      description: "active filter: no rendered item has done class",
      onlyFixtures: ["filter-active"],
      check: ({ root, contract }) => {
        if (contract.filter !== "active")
          return `expected filter=active, got ${contract.filter}`;
        const doneLis = root.querySelectorAll("li.todo-item.done").length;
        return doneLis === 0 || `active filter still shows ${doneLis} done items`;
      },
    },
  ],
});
