#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer from "puppeteer";

const server = new Server(
  {
    name: "example-servers/puppeteer",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {
        listChanged: true,
      },
      tools: {},
    },
  },
);

let browser: puppeteer.Browser | undefined;
let consoleLogs: string[] = [];

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "console://logs",
        mimeType: "text/plain",
        name: "Browser console logs",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri.toString() === "console://logs") {
    return {
      contents: [
        {
          uri: "console://logs",
          mimeType: "text/plain",
          text: consoleLogs.join("\n"),
        },
      ],
    };
  }
  console.error("Resource not found:", request.params.uri);
  throw new Error("Resource not found");
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "navigate",
        description: "Navigate to a URL",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "navigate") {
    const url = request.params.arguments?.url as string;

    if (!browser) {
      browser = await puppeteer.launch({ headless: false });

      const pages = await browser.pages();
      pages[0].on("console", (msg) => {
        const logEntry = `[${msg.type()}] ${msg.text()}`;
        consoleLogs.push(logEntry);
        server.notification({
          method: "notifications/resources/updated",
          params: { uri: "console://logs" },
        });
      });
    }

    const pages = await browser.pages();
    await pages[0].goto(url);

    return {
      content: [{ type: "text", text: `Navigated to ${url}` }],
      isError: false,
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
