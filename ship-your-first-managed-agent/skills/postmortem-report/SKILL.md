---
name: postmortem-report
description: How the SRE team writes a postmortem PDF. Use this whenever asked for a postmortem, an incident report, a write-up to share, or a PDF of what happened.
---

# Postmortem report

You build the PDF yourself, in your sandbox. There is no template. Design it so a director understands the event in one minute and an engineer can check every claim.

## What it must contain

1. A headline and a summary of three or four sentences.
2. A table of pages: page id, service, root cause. Pages that share a root cause are one incident; mark the others as symptoms.
3. At least one chart drawn from real data. Compute it in your script from `/mnt/session/uploads/app.log` (for example p99 latency or error rate per minute for each paged service) and mark the deploys on it.
4. For each root cause: a timeline in UTC, the evidence that proves it, what was ruled out, and the fix.
5. Action items, each with an owner team and a priority.

## How to build it

- Python with matplotlib and pandas is installed. Use Matplotlib for charts and ReportLab for the report.
- Load each complete incident file from `/workspace/findings/*.json` and check that every page in scope is represented. Start from those instead of investigating again. Calculate chart data from the log in your script, rather than copying arrays from prose.
- Save the result to `/mnt/session/outputs/postmortem.pdf`. Only files under `/mnt/session/outputs/` reach the user.
- Use wrapped cells in flow-layout tables, such as ReportLab `Paragraph` cells in a `Table` or `LongTable`. Let the tallest wrapped cell determine the shared row height, including padding. Repeat headers when a table spans pages.
- Keep text, tables and charts inside the page margins at readable font sizes. Aim for two to four pages and allow extra pages when needed for legibility.
- Render the PDF to images and inspect every page for overlaps, clipping and unreadable labels. Repair any defects, then regenerate and inspect the changed pages.
- Follow any postmortem conventions you find in team memory.

When it is built, tell the user the file name in one or two sentences. Do not paste the report into the chat.
