# Rubric: filing analysis for {ticker}

Grade each criterion independently against the deliverables.

1. **Scorecard delivered** — `/mnt/session/outputs/scorecard.json` exists, parses as a single JSON object, and contains every required field with the documented types (numbers as numbers, `guidance_tone` and `confidence` from the allowed values, list fields within their caps). The final reply contains the same JSON.
2. **Numbers are grounded** — revenue, growth, and margin figures come from the company's most recent 10-K or 10-Q (the scorecard's `filing_form`/`fiscal_period`/`filing_date` identify it) and are consistent with each other; computed figures (growth, margins) are arithmetically plausible given the reported values.
3. **Risk work is comparative** — `top_risks` reflect the filing's Item 1A, and `risk_factor_changes` describe genuine differences versus the prior year's filing (or state that nothing material changed), not generic boilerplate.
4. **Memory note written** — a note exists in the desk memory at the path given in `memory_note_path`, covering the same filing, with the template's sections present.
5. **Honest uncertainty** — anything the agent could not verify is reflected in `data_caveats` or `confidence`, rather than presented as fact.
