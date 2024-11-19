# DuckDuckGo MCP Server
MCP server providing search functionality via DuckDuckGo's HTML interface.

## Core Concepts
### Resources
Single resource endpoint for search results:
```duckduckgo://search```

### Tools
Search tool with configurable result count:
```json
{
  "name": "search",
  "arguments": {
    "query": "your search query",
    "numResults": 5  // optional, defaults to 5
  }
}
```

## Implementation Details
- HTML scraping via JSDOM
- Clean result formatting with titles, snippets, and URLs
- Error handling for network/parsing issues
- Request rate limiting built-in via DuckDuckGo's interface

## Usage Example
```typescript
// Search tool response format
{
  content: [{
    type: "text",
    text: "Title: Example Result\nSnippet: Result description...\nURL: https://..."
  }]
}
```

## Development
Requires Node.js and npm. Uses ES modules.
