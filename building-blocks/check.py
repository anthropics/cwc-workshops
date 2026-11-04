# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# Setup check. Three green lines and you're ready for 01.
import os, sys

print(f"{'ok ' if sys.version_info >= (3, 10) else 'NO '} Python {sys.version.split()[0]} (need 3.10 or newer)")
try:
    import anthropic
except ImportError:
    sys.exit("NO  anthropic isn't installed. Run: pip install -r requirements.txt")
major = int(anthropic.__version__.split(".")[0])
print(f"{'ok ' if major >= 2 else 'NO '} anthropic {anthropic.__version__} (need 2.3 or newer: pip install -U anthropic)")
if not os.environ.get("ANTHROPIC_API_KEY"):
    sys.exit("NO  ANTHROPIC_API_KEY isn't set in this shell. Run: export ANTHROPIC_API_KEY=<your key>")
resp = anthropic.Anthropic().messages.create(model="claude-haiku-5-5", max_tokens=50,
                                             messages=[{"role": "user", "content": "Say ready."}])
print(f"ok  {resp.model} answered. You're set: python 01_code_execution.py")
