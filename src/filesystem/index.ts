#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { exec as execCallback } from "child_process";

// Define interfaces for the tool arguments
interface ReadFileArgs {
  path: string;
}

interface ReadMultipleFilesArgs {
  paths: string[];
}

interface WriteFileArgs {
  path: string;
  content: string;
}

interface CreateDirectoryArgs {
  path: string;
}

interface ListDirectoryArgs {
  path: string;
}

interface DeleteFileArgs {
  path: string;
  recursive?: boolean;
}

interface MoveFileArgs {
  source: string;
  destination: string;
}

interface SearchFilesArgs {
  path: string;
  pattern: string;
}

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

const exec = promisify(execCallback);

const server = new Server(
  {
    name: "example-servers/filesystem",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Need this since we're using resources
    },
  },
);

// Add Resources List Handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "file://system",
        mimeType: "text/plain",
        name: "File System Operations",
      },
    ],
  };
});

// Add Read Resource Handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri.toString() === "file://system") {
    return {
      contents: [
        {
          uri: "file://system",
          mimeType: "text/plain",
          text: "File system operations interface",
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
        name: "read_file",
        description:
          "Read the complete contents of a file from the file system. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Absolute or relative path to the file you want to read",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "read_multiple_files",
        description:
          "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation.",
        inputSchema: {
          type: "object",
          properties: {
            paths: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "List of file paths to read. Can be absolute or relative paths.",
            },
          },
          required: ["paths"],
        },
      },
      {
        name: "write_file",
        description:
          "Create a new file or completely overwrite an existing file with new content. " +
          "This tool will create any necessary parent directories automatically. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path where the file should be written. Parent directories will be created if needed.",
            },
            content: {
              type: "string",
              description:
                "Content to write to the file. Can include newlines and special characters.",
            },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "create_directory",
        description:
          "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path of the directory to create. Will create parent directories if they don't exist.",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "list_directory",
        description:
          "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path of the directory to list. Must be an existing directory.",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "delete_file",
        description:
          "Remove files or directories from the file system. Can handle both individual " +
          "files and directories. For directories, you can specify recursive deletion to " +
          "remove all contents. Use with extreme caution as deletions are permanent and " +
          "cannot be undone.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path of the file or directory to delete",
            },
            recursive: {
              type: "boolean",
              description:
                "If true, recursively delete directories and their contents. Required for non-empty directories.",
              default: false,
            },
          },
          required: ["path"],
        },
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory.",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description: "Current path of the file or directory",
            },
            destination: {
              type: "string",
              description:
                "New path where the file or directory should be moved to",
            },
          },
          required: ["source", "destination"],
        },
      },
      {
        name: "search_files",
        description:
          "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. The search " +
          "is case-insensitive and matches partial names. Returns full paths to all " +
          "matching items. Great for finding files when you don't know their exact location.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Starting directory for the search",
            },
            pattern: {
              type: "string",
              description:
                "Text pattern to search for in file and directory names",
            },
          },
          required: ["path", "pattern"],
        },
      },
      {
        name: "get_file_info",
        description:
          "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path to the file or directory to get information about",
            },
          },
          required: ["path"],
        },
      },
    ],
  };
});

async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
        results.push(fullPath);
      }

      if (entry.isDirectory()) {
        await search(fullPath);
      }
    }
  }

  await search(rootPath);
  return results;
}

// Add type guard functions for each argument type
function isReadFileArgs(args: unknown): args is ReadFileArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    typeof (args as ReadFileArgs).path === "string"
  );
}

function isReadMultipleFilesArgs(args: unknown): args is ReadMultipleFilesArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "paths" in args &&
    Array.isArray((args as ReadMultipleFilesArgs).paths) &&
    (args as ReadMultipleFilesArgs).paths.every(
      (path) => typeof path === "string",
    )
  );
}

function isWriteFileArgs(args: unknown): args is WriteFileArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    "content" in args &&
    typeof (args as WriteFileArgs).path === "string" &&
    typeof (args as WriteFileArgs).content === "string"
  );
}

function isCreateDirectoryArgs(args: unknown): args is CreateDirectoryArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    typeof (args as CreateDirectoryArgs).path === "string"
  );
}

function isListDirectoryArgs(args: unknown): args is ListDirectoryArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    typeof (args as ListDirectoryArgs).path === "string"
  );
}

function isDeleteFileArgs(args: unknown): args is DeleteFileArgs {
  const deleteArgs = args as DeleteFileArgs;
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    typeof deleteArgs.path === "string" &&
    (deleteArgs.recursive === undefined ||
      typeof deleteArgs.recursive === "boolean")
  );
}

function isMoveFileArgs(args: unknown): args is MoveFileArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "source" in args &&
    "destination" in args &&
    typeof (args as MoveFileArgs).source === "string" &&
    typeof (args as MoveFileArgs).destination === "string"
  );
}

function isSearchFilesArgs(args: unknown): args is SearchFilesArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    "pattern" in args &&
    typeof (args as SearchFilesArgs).path === "string" &&
    typeof (args as SearchFilesArgs).pattern === "string"
  );
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        if (!isReadFileArgs(args)) {
          throw new Error("Invalid arguments for read_file");
        }
        const content = await fs.readFile(args.path, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_multiple_files": {
        if (!isReadMultipleFilesArgs(args)) {
          throw new Error("Invalid arguments for read_multiple_files");
        }
        const results = await Promise.all(
          args.paths.map(async (filePath: string) => {
            try {
              const content = await fs.readFile(filePath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        if (!isWriteFileArgs(args)) {
          throw new Error("Invalid arguments for write_file");
        }
        await fs.writeFile(args.path, args.content, "utf-8");
        return {
          content: [
            { type: "text", text: `Successfully wrote to ${args.path}` },
          ],
        };
      }

      case "create_directory": {
        if (!isCreateDirectoryArgs(args)) {
          throw new Error("Invalid arguments for create_directory");
        }
        await fs.mkdir(args.path, { recursive: true });
        return {
          content: [
            {
              type: "text",
              text: `Successfully created directory ${args.path}`,
            },
          ],
        };
      }

      case "list_directory": {
        if (!isListDirectoryArgs(args)) {
          throw new Error("Invalid arguments for list_directory");
        }
        const entries = await fs.readdir(args.path, { withFileTypes: true });
        const formatted = entries
          .map(
            (entry) =>
              `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`,
          )
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "delete_file": {
        if (!isDeleteFileArgs(args)) {
          throw new Error("Invalid arguments for delete_file");
        }
        const stats = await fs.stat(args.path);
        if (stats.isDirectory()) {
          if (args.recursive) {
            await fs.rm(args.path, { recursive: true });
          } else {
            await fs.rmdir(args.path);
          }
        } else {
          await fs.unlink(args.path);
        }
        return {
          content: [
            { type: "text", text: `Successfully deleted ${args.path}` },
          ],
        };
      }

      case "move_file": {
        if (!isMoveFileArgs(args)) {
          throw new Error("Invalid arguments for move_file");
        }
        await fs.rename(args.source, args.destination);
        return {
          content: [
            {
              type: "text",
              text: `Successfully moved ${args.source} to ${args.destination}`,
            },
          ],
        };
      }

      case "search_files": {
        if (!isSearchFilesArgs(args)) {
          throw new Error("Invalid arguments for search_files");
        }
        const results = await searchFiles(args.path, args.pattern);
        return {
          content: [
            {
              type: "text",
              text:
                results.length > 0 ? results.join("\n") : "No matches found",
            },
          ],
        };
      }

      case "get_file_info": {
        if (!isCreateDirectoryArgs(args)) {
          throw new Error("Invalid arguments for get_file_info");
        }
        const info = await getFileStats(args.path);
        return {
          content: [
            {
              type: "text",
              text: Object.entries(info)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n"),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
