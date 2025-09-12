This folder contains quick test requests for the universal analysis endpoint.

Usage:

- Start the server (default: PORT=3000)
- Run the script:

```bash
BASE_URL=http://localhost:3000 ./testing/test_analysis_requests.sh
```

Environment:
- If you want `execute=true` to call OpenAI, export OPENAI_API_KEY and optionally OPENAI_MODEL in your environment before running the script.
- If your correlations data lives in a non-default folder, set CORRELATIONS_DIR to that path.

Files:
- test_analysis_requests.sh: Curl-based test requests covering:
  - prefixed VDEM codes
  - unprefixed codes
  - IMF codes
  - fuzzy country name
  - execute=true example
  - missing country (expected 404)
