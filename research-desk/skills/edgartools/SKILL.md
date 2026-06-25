---
name: edgartools-sec-data
description: How to pull SEC EDGAR data with the edgartools Python package — company lookup, filings, XBRL financial statements, and filing sections like Item 1A risk factors. Use whenever a task involves SEC filings, 10-K/10-Q data, or company financials.
---

# edgartools: SEC EDGAR data access

`edgartools` is the desk's standard way to read SEC data. It is preinstalled in your environment. Work in Python (a script or `python -c`), not by fetching sec.gov pages by hand.

## Always set your identity first

The SEC requires a contact identity on automated requests. Do this before any other call, every session:

```python
from edgar import set_identity
set_identity("Research Desk workshop attendee@example.com")  # use the EDGAR_IDENTITY value you were given
```

(Equivalently, the `EDGAR_IDENTITY` environment variable, exported before running Python.)

## Companies and filings

```python
from edgar import Company

company = Company("NVDA")              # by ticker (or CIK)
company.name, company.cik, company.industry

filings = company.get_filings(form="10-K")   # also "10-Q", "8-K", "DEF 14A", ...
latest_10k = filings.latest()                # most recent of that form
latest_10q = company.get_filings(form="10-Q").latest()

latest_10k.form, latest_10k.filing_date, latest_10k.accession_no
```

Pick whichever of the latest 10-K / 10-Q is more recent when asked for "the most recent filing". Foreign private issuers file 20-F instead of 10-K.

## Reading the filing

```python
filing = latest_10k
tenk = filing.obj()        # rich object for 10-K/10-Q: sections, financials

# Sections (10-K item numbers; 10-Q uses Part/Item naming)
risk_factors = tenk["Item 1A"]      # Risk Factors text
mda = tenk["Item 7"]                # Management's Discussion & Analysis
business = tenk["Item 1"]

# Plain text of the whole filing if you need to search it
text = filing.text()
```

Sections are long — extract what you need rather than pasting whole sections into your reply.

## Financial statements (XBRL)

```python
financials = tenk.financials          # also: company.get_financials() for the latest annual figures

income = financials.income_statement()
balance = financials.balance_sheet()
cashflow = financials.cashflow_statement()
```

These return tabular objects (pandas-friendly). Typical fields: total revenue, gross profit, operating income, net income, cash and equivalents, total debt, inventory, R&D expense. The same statement usually carries the prior period's column — use it for year-over-year comparisons instead of fetching another filing.

## Segment and geographic revenue

Consolidated revenue hides the story; the segment note is where concentration and regional shifts show up. Segment data lives in the financial-statement notes (ASC 280), not the primary statements:

```python
# The segment/geography breakdown is a note, not a primary statement.
# Search the filing text for the segment note and read the tables around it.
text = filing.text()
for marker in ["Segment Information", "revenue by geographic", "Disaggregation of Revenue"]:
    idx = text.find(marker)
    if idx != -1:
        print(text[idx : idx + 3000])   # the note's tables follow the heading
        break
```

Report segment/geography revenue alongside the consolidated figure and call out: any region or segment that moved more than ~20% year over year, and any customer-concentration disclosure (usually phrased "one customer accounted for X% of revenue").

## Useful patterns

- **Year-over-year risk-factor diff:** pull Item 1A from this year's and last year's 10-K (`company.get_filings(form="10-K")` is sorted; take the first two) and compare.
- **Insider activity:** `company.get_filings(form="4")` lists Form 4 insider transaction filings.
- **Be defensive:** the API surface evolves. If an attribute or method isn't there, inspect it (`dir(obj)`, `help(obj)`) or fall back to `filing.text()` and targeted searching, and note the fallback in your output.
- **Be polite to EDGAR:** keep requests to what you need; everything is cached within the session by the library.

## Units and reporting hygiene

- Statement values are typically raw USD; convert to millions when reporting (`value / 1e6`) and label them.
- Always state which filing (form, fiscal period, filing date) a number came from.
- If a figure is missing or ambiguous in XBRL, say so rather than estimating.
