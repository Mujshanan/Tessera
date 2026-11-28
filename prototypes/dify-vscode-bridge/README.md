# Dify ↔ Tessera ↔ VS Code bridge prototype

Experimental vertical slice; not production-ready.

## Architecture

Run Dify separately as the workflow-authoring service. Do not vendor or rewrite its source into Tessera yet. Keep Dify's source and license boundary explicit.

The VS Code extension exposes an authenticated local HTTP bridge. A Dify HTTP Request node submits a script run; the extension executes that Python file with the interpreter configured in VS Code. The example uses NumPy and returns JSON for an HTML canvas plot.

Dify workflow → HTTP Request → VS Code bridge → Python/NumPy → JSON result → HTML canvas.

The bridge is a replaceable test adapter, not Tessera's final execution engine.

## Setup

1. Install and run Dify separately.
2. Open `prototypes/dify-vscode-bridge/vscode-extension` as an extension development project.
3. Run `npm install`, then `npm run compile`.
4. Press F5 in VS Code to launch the Extension Development Host.
5. In the Extension Development Host, open the repository folder `prototypes/dify-vscode-bridge` as the workspace.
6. Run **Tessera Bridge: Start Local Server** from the Command Palette.
7. Copy the bearer token from the **Tessera Bridge** output channel.
8. Install NumPy in the interpreter selected by `tessera.pythonPath`: `python -m pip install numpy`.
9. Open `http://127.0.0.1:8765/plot?token=<BEARER_TOKEN>` in a browser to see the plot page. The page polls for the latest result.

## Direct smoke test

Send this request from a terminal on the same host (replace the token):

```bash
curl -X POST http://127.0.0.1:8765/v1/runs \
  -H "Authorization: Bearer <BEARER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"script":"example/numpy_plot.py","input":{"samples":80,"amplitude":2.0}}'
```

Poll the returned ID:

```bash
curl http://127.0.0.1:8765/v1/runs/<RUN_ID> \
  -H "Authorization: Bearer <BEARER_TOKEN>"
```

## Dify workflow configuration

Use an HTTP Request node:
- Method: POST
- URL: `http://127.0.0.1:8765/v1/runs` when Dify can reach the host loopback directly.
- Header: `Authorization: Bearer <BEARER_TOKEN>`
- JSON body: `{"script":"example/numpy_plot.py","input":{"samples":80,"amplitude":2.0}}`

### Dify running in Docker

A container's `127.0.0.1` is the container itself, not the host. For a local Docker test:

1. In the VS Code extension settings, set `Tessera Bridge › Allow Network` to true. This binds the bridge to `0.0.0.0`.
2. Keep the machine on a trusted private network and configure the OS firewall to allow port 8765 only from the Docker/Dify host network. Do not port-forward it or expose it to the public internet.
3. Configure the Dify HTTP Request URL as `http://host.docker.internal:8765/v1/runs` where that hostname is supported. On Linux Docker, host-gateway mapping may need to be configured for the Dify container.
4. Use the generated bearer token. Do not paste it into shared workflow templates or commit it to the repository.

Turn **Allow Network** off again after the container test. The default is loopback-only.

## Security limits

Trusted local development only. The token is regenerated each time the server starts. Script paths are restricted to the first open workspace folder; traversal and non-Python files are rejected. The bridge executes trusted workspace code with the user's OS permissions. There is no process sandbox, durable job store, rate limiting, multi-workspace authorization, TLS, or production secret management. Never expose this prototype to an untrusted network.

## Acceptance criteria

- Extension compiles.
- NumPy executes using the VS Code workspace interpreter.
- Inputs arrive as JSON on stdin; stdout contains one JSON value.
- Dify receives a run ID and can poll status/result.
- HTML canvas plots returned x/y data without rerunning Python.
- Invalid paths, missing tokens, malformed JSON and Python errors are reported.
- VS Code remains responsive while Python runs.

No Dify source is copied into Tessera. Dify's database/runtime does not become Tessera's project authority.
