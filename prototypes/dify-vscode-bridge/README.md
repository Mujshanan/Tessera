# Dify ↔ Tessera ↔ VS Code bridge prototype

Experimental vertical slice; not production-ready.

## Architecture decision

Run Dify separately as the workflow-authoring service. Do not vendor or rewrite its source into Tessera yet. Its repository uses the Dify Open Source License, an Apache-2.0-based license with additional conditions. Keep the upstream code and license boundary explicit.

This prototype adds a VS Code workspace extension exposing an authenticated loopback HTTP bridge. A Dify HTTP Request node can submit a Python script run. The extension executes the script with the configured Python interpreter in the open workspace. The example uses NumPy and a browser HTML canvas.

Dify workflow → HTTP Request → VS Code bridge → Python/NumPy → JSON result → HTML canvas.

The bridge is a replaceable test adapter, not Tessera's final execution engine.

## Test outline

1. Install and run Dify separately using its official self-hosting instructions.
2. Open vscode-extension as a VS Code extension project, install dependencies, compile, and press F5.
3. Open this prototype directory as the workspace in the Extension Development Host.
4. Run “Tessera Bridge: Start Local Server”.
5. Copy the bearer token from the Tessera Bridge output channel.
6. Install NumPy in the configured interpreter: python -m pip install numpy.
7. POST to http://127.0.0.1:8765/v1/runs with JSON: {"script":"example/numpy_plot.py","input":{"samples":80,"amplitude":2.0}}.
8. Poll /v1/runs/{runId}; open /plot?token={token} to view the latest successful result.

## Dify workflow

Use an HTTP Request node with POST to http://127.0.0.1:8765/v1/runs, Authorization: Bearer <token>, and the JSON request above.

Dify running in Docker generally cannot reach the host's 127.0.0.1. Do not expose an unauthenticated listener to work around this. The default bridge is loopback-only. A later test can use an explicitly configured host-reachable listener, firewall restrictions and a strong token, or a separate bridge service.

## Security limits

Trusted local development only. The token is regenerated on each server start. Script paths are restricted to the first open workspace folder; traversal and non-Python files are rejected. There is no process sandbox, durable job store, rate limiting, multi-workspace authorization or remote TLS. Do not expose this prototype to a LAN or public internet.

## Acceptance criteria

- NumPy executes using the VS Code workspace interpreter.
- Inputs are JSON on stdin; output is one JSON value on stdout.
- Dify receives a run ID and can poll status/result.
- The HTML canvas plots returned x/y data without rerunning Python.
- Invalid paths, missing tokens, malformed JSON and Python errors are reported.
- VS Code remains responsive while Python runs.

No Dify source is copied into Tessera. Dify's database/runtime does not become Tessera's project authority.
