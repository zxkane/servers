# sentry MCP server

MCP server for retrieving issues from sentry.io

## Components

### Resources

This server does not implement any resources.

### Prompts

The server provides a single prompt:
- sentry-issue: Retrieves a Sentry issue by ID or URL
  - Required "issue_id_or_url" argument to specify the issue
  - Returns issue details including title, status, level, timestamps and stacktrace

### Tools

The server implements one tool:
- get-sentry-issue: Retrieves and analyzes Sentry issues
  - Takes "issue_id_or_url" as required string argument
  - Used for investigating production errors and crashes
  - Provides access to detailed stacktraces
  - Shows error patterns and frequencies
  - Includes first/last occurrence timestamps
  - Displays error counts and status

## Install

### Claude Desktop

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```
  "mcpServers": {
    "sentry": {
      "command": "uv",
      "args": [
        "--directory",
        "/Users/davidsp/code/mcp/servers/src/sentry",
        "run",
        "sentry"
      ]
    }
  }
```

## Develop and Debug

Since MCP servers run over stdio, debugging can be challenging. For the best debugging
experience, we strongly recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector).


You can launch the MCP Inspector via [`npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) with this command:

```bash
npx @modelcontextprotocol/inspector uv --directory /Users/davidsp/code/mcp/servers/src/sentry run sentry
```


Upon launching, the Inspector will display a URL that you can access in your browser to begin debugging.
