You are running the desk's scheduled weekly memo. Watchlist: {watchlist}.

1. Set up EDGAR access: `export EDGAR_IDENTITY="{edgar_identity}"`. Use the `edgartools` package as documented in your edgartools skill.
2. Read the desk memory under `/companies/` to see what the desk already knows and which filing each note covers.
3. For each watchlist company, check whether a new 10-K or 10-Q has been filed since the desk's note. For companies with a new filing (limit yourself to the three most significant if there are many), do a focused update: refresh the numbers and risk changes, and update the company's memory note.
4. Write the weekly memo to both `/mnt/session/outputs/weekly-memo.md` and the desk memory at `/memos/<today>-weekly.md`, covering: which companies filed since the last memo and what changed; the two or three themes moving across the watchlist; which existing desk notes are now stale and should be refreshed next.
5. Your final reply is the memo itself.

If nothing on the watchlist has filed since the desk's notes were written, say so in the memo and keep it short.
