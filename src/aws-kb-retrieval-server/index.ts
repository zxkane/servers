#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { fromNodeProviderChain, fromIni } from "@aws-sdk/credential-providers";

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const AWS_PROFILE = process.env.AWS_PROFILE || 'default';
// AWS client initialization
const bedrockClient = new BedrockAgentRuntimeClient({
  region: AWS_REGION,
  maxAttempts: 3,
  // Try explicit profile credentials first, then fall back to provider chain
  credentials: async () => {
    try {
      // First try loading from profile
      const profileCreds = await fromIni({ profile: AWS_PROFILE })();
      console.error('Successfully loaded credentials from profile');
      return profileCreds;
    } catch (error) {
      console.error('Failed to load profile credentials, falling back to provider chain:', error);
      try {
        // Fall back to provider chain
        const chainCreds = await fromNodeProviderChain()();
        console.error('Successfully loaded credentials from provider chain');
        return chainCreds;
      } catch (error) {
        console.error('Failed to load credentials from provider chain:', error);
        throw error;
      }
    }
  },
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10000, // 10 seconds connection timeout
    requestTimeout: 300000, // 5 minutes request timeout
  })
});

interface RAGSource {
  id: string;
  fileName: string;
  snippet: string;
  score: number;
}

async function retrieveContext(
  query: string,
  knowledgeBaseId: string,
  n: number = 3
): Promise<{
  context: string;
  isRagWorking: boolean;
  ragSources: RAGSource[];
}> {
  try {
    if (!knowledgeBaseId) {
      console.error("knowledgeBaseId is not provided");
      return {
        context: "",
        isRagWorking: false,
        ragSources: [],
      };
    }

    const input: RetrieveCommandInput = {
      knowledgeBaseId: knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: n },
      },
    };

    const command = new RetrieveCommand(input);
    const response = await bedrockClient.send(command);
    const rawResults = response?.retrievalResults || [];
    const ragSources: RAGSource[] = rawResults
      .filter((res) => res?.content?.text)
      .map((result, index) => {
        const uri = result?.location?.s3Location?.uri || "";
        const fileName = uri.split("/").pop() || `Source-${index}.txt`;
        return {
          id: (result.metadata?.["x-amz-bedrock-kb-chunk-id"] as string) || `chunk-${index}`,
          fileName: fileName.replace(/_/g, " ").replace(".txt", ""),
          snippet: result.content?.text || "",
          score: (result.score as number) || 0,
        };
      })
      .slice(0, 3);

    const context = rawResults
      .filter((res): res is { content: { text: string } } => res?.content?.text !== undefined)
      .map(res => res.content.text)
      .join("\n\n");

    return {
      context,
      isRagWorking: true,
      ragSources,
    };
  } catch (error) {
    console.error("RAG Error:", error);
    return { context: "", isRagWorking: false, ragSources: [] };
  }
}

// Define the retrieval tool
const RETRIEVAL_TOOL: Tool = {
  name: "retrieve_from_aws_kb",
  description: "Performs retrieval from the AWS Knowledge Base using the provided query and Knowledge Base ID.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The query to perform retrieval on" },
      knowledgeBaseId: { type: "string", description: "The ID of the AWS Knowledge Base" },
      n: { type: "number", default: 3, description: "Number of results to retrieve" },
    },
    required: ["query", "knowledgeBaseId"],
  },
};

// Server setup
const server = new Server(
  {
    name: "aws-kb-retrieval-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [RETRIEVAL_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "retrieve_from_aws_kb") {
    const { query, knowledgeBaseId, n = 3 } = args as Record<string, any>;
    try {
      const result = await retrieveContext(query, knowledgeBaseId, n);
      if (result.isRagWorking) {
        return {
          content: [
            { type: "text", text: `Context: ${result.context}` },
            { type: "text", text: `RAG Sources: ${JSON.stringify(result.ragSources)}` },
          ],
        };
      } else {
        return {
          content: [{ type: "text", text: "Retrieval failed or returned no results." }],
        };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error occurred: ${error}` }],
      };
    }
  } else {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AWS KB Retrieval Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
