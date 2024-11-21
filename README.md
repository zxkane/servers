# MCP servers ![NPM Version](https://img.shields.io/npm/v/%40modelcontextprotocol%2Fexample-servers)

Example servers for the Model Context Protocol, to demonstrate the kinds of things you can do!

## Getting started

The servers in this repository can be used directly with `npx`. For example:

```sh
npx -y @modelcontextprotocol/server-memory
```

This will start the memory server. However, this isn't very useful on its own, and should instead be configured into an MCP client. For example, here's the Claude Desktop configuration to use the above server:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

Individual servers may require additional arguments or environment variables to be set. See the READMEs within [src](src/) for more information.
