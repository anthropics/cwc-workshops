// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The server reads prompt templates, the skill bundle, and watchlists from
  // disk at request time; keep them in the standalone output for Docker.
  outputFileTracingIncludes: {
    "/api/desk/provision": ["./prompts/**", "./skills/**", "./watchlists/**"],
    "/api/desk/chat": ["./prompts/**", "./watchlists/**"],
    "/api/desk/analyze": ["./prompts/**"],
    "/api/deployments": ["./prompts/**", "./watchlists/**"],
  },
};

export default nextConfig;
