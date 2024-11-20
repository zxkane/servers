# Brave Search MCP Server

An MCP server implementation that integrates the Brave Search API, providing both web and local search capabilities through the Model Context Protocol.

## Features

- **Web Search**: General queries, news, articles, with pagination and freshness controls
- **Local Search**: Find businesses, restaurants, and services with detailed information
- **Flexible Filtering**: Control result types, safety levels, and content freshness
- **Smart Fallbacks**: Local search automatically falls back to web when no results are found

## Configuration

### Client Configuration
Add this to your MCP client config:

```json
"brave-search": {
  "command": "mcp-server-brave-search",
  "env": {
    "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
  }
}
```

Alternatively, you can set the API key as an environment variable:

```bash
export BRAVE_API_KEY='your_actual_api_key_here'
```

### Getting an API Key
1. Sign up for a Brave Search API account
2. Choose a plan (Free tier available)
3. Generate your API key from the developer dashboard

## Tools

### brave_web_search
Performs general web searches:

```javascript
{
  "name": "brave_web_search",
  "arguments": {
    "query": "latest AI developments",
    "count": 10,
    "freshness": "pw",  // Past week
    "safesearch": "moderate"
  }
}
```

### brave_local_search
Finds local businesses and services:

```javascript
{
  "name": "brave_local_search",
  "arguments": {
    "query": "pizza near Central Park",
    "count": 5,
    "units": "imperial"
  }
}
```

## Key Implementation Details

- Rate limiting to respect API quotas (1 request/second, 15000/month)
- Parallel fetching of POI details and descriptions for local search
- Type-safe argument validation
- Comprehensive error handling and logging

## Development

```bash
# Install dependencies
npm install

# Build the server
npm run build

# Run the server
mcp-server-brave-search
```

## Contributing

Contributions welcome! Please check the issues tab or submit a PR.

## License

MIT - see [LICENSE](LICENSE) file for details.
