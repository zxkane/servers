#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const server = new Server(
  {
    name: "example-servers/duckduckgo",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Required since we're using ListResourcesRequestSchema
    },
  },
);

// Add Resources List Handler - Important for showing up in the tools list
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "duckduckgo://search",
        mimeType: "text/plain",
        name: "DuckDuckGo Search Results",
      },
    ],
  };
});

// Add Read Resource Handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri.toString() === "duckduckgo://search") {
    return {
      contents: [
        {
          uri: "duckduckgo://search",
          mimeType: "text/plain",
          text: "DuckDuckGo search interface",
        },
      ],
    };
  }
  throw new Error("Resource not found");
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description:
          "Performs a search using DuckDuckGo and returns the top search results. " +
          "Returns titles, snippets, and URLs of the search results. " +
          "Use this tool when you need to search for current information on the internet.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to look up",
            },
            numResults: {
              type: "number",
              description: "Number of results to return (default: 5)",
              default: 5,
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    try {
      const { query, numResults = 5 } = request.params.arguments as {
        query: string;
        numResults?: number;
      };

      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      };

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const results = [];
      const resultElements = document.querySelectorAll(".result");

      for (let i = 0; i < Math.min(numResults, resultElements.length); i++) {
        const result = resultElements[i];
        const titleElem = result.querySelector(".result__title");
        const snippetElem = result.querySelector(".result__snippet");
        const urlElem = result.querySelector(".result__url");

        if (titleElem && snippetElem) {
          results.push({
            title: titleElem.textContent?.trim() || "",
            snippet: snippetElem.textContent?.trim() || "",
            url: urlElem?.getAttribute("href") || "",
          });
        }
      }

      const formattedResults = results
        .map(
          (result) =>
            `Title: ${result.title}\nSnippet: ${result.snippet}\nURL: ${result.url}\n`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: formattedResults || "No results found.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error performing search: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DuckDuckGo MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
