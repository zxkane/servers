# DuckDuckGo MCP Server

MCP server providing search functionality via DuckDuckGo's HTML interface.

## Components

### Resources
Single resource endpoint for search interface:
```duckduckgo://search```

### Tools
- **duckduckgo_search**
  - Performs a search using DuckDuckGo and returns the top search results
  - Inputs:
    - `query` (string, required): The search query to look up
    - `numResults` (number, optional): Number of results to return (default: 10)
  - Returns titles, snippets, and URLs of the search results

## Usage Example
```javascript
// Example tool call
{
  "name": "duckduckgo_search",
  "arguments": {
    "query": "your search query",
    "numResults": 10
  }
}

// Example response format:
{
  "content": [{
    "type": "text",
    "text": "Title: Result Title\nSnippet: Result description...\nURL: https://example.com\n\nTitle: Another Result\n..."
  }]
}
```
