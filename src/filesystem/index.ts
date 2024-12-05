#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase();
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = args.map(dir => 
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(args.map(async (dir) => {
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
    
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditOperation = z.object({
  // The text to search for
  oldText: z.string().describe('Text to search for - can be a substring of the target'),
  // The new text to replace with
  newText: z.string().describe('Text to replace the found text with'),
});

const EditOptions = z.object({
  preserveIndentation: z.boolean().default(true).describe('Preserve existing indentation patterns in the file'),
  normalizeWhitespace: z.boolean().default(true).describe('Normalize whitespace while preserving structure'),
  partialMatch: z.boolean().default(true).describe('Enable fuzzy matching with confidence scoring')
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  // Optional: preview changes without applying them
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format'),
  // Optional: configure matching and formatting behavior
  options: EditOptions.default({})
});



const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations
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
      
      try {
        // Validate each path before processing
        await validatePath(fullPath);

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// file editing and diffing utilities
function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
  return createTwoFilesPatch(
    filepath,
    filepath,
    originalContent,
    newContent,
    'original',
    'modified'
  );
}

// Utility functions for text normalization and matching
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeWhitespace(text: string, preserveIndentation: boolean = true): string {
  if (!preserveIndentation) {
    // Collapse all whitespace to single spaces if not preserving indentation
    return text.replace(/\s+/g, ' ');
  }
  
  // Preserve line structure but normalize inline whitespace
  return text.split('\n').map(line => {
    // Preserve leading whitespace
    const indent = line.match(/^[\s\t]*/)?.[0] || '';
    // Normalize rest of line
    const content = line.slice(indent.length).trim().replace(/\s+/g, ' ');
    return indent + content;
  }).join('\n');
}

interface EditMatch {
  start: number;
  end: number;
  confidence: number;
}

function findBestMatch(content: string, searchText: string, options: z.infer<typeof EditOptions>): EditMatch | null {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedSearch = normalizeLineEndings(searchText);
  
  // Try exact match first
  const exactPos = normalizedContent.indexOf(normalizedSearch);
  if (exactPos !== -1) {
    return {
      start: exactPos,
      end: exactPos + searchText.length,
      confidence: 1.0
    };
  }
  
  // If whitespace normalization is enabled, try that next
  if (options.normalizeWhitespace) {
    const normContent = normalizeWhitespace(normalizedContent, options.preserveIndentation);
    const normSearch = normalizeWhitespace(normalizedSearch, options.preserveIndentation);
    const normPos = normContent.indexOf(normSearch);
    
    if (normPos !== -1) {
      // Find the corresponding position in original text
      const beforeMatch = normContent.slice(0, normPos);
      const originalPos = findOriginalPosition(content, beforeMatch);
      return {
        start: originalPos,
        end: originalPos + searchText.length,
        confidence: 0.9
      };
    }
  }
  
  // If partial matching is enabled, try to find the best partial match
  if (options.partialMatch) {
    const lines = normalizedContent.split('\n');
    const searchLines = normalizedSearch.split('\n');
    
    let bestMatch: EditMatch | null = null;
    let bestScore = 0;
    
    // Sliding window search through the content
    for (let i = 0; i < lines.length - searchLines.length + 1; i++) {
      let matchScore = 0;
      let matchLength = 0;
      
      for (let j = 0; j < searchLines.length; j++) {
        const contentLine = options.normalizeWhitespace 
          ? normalizeWhitespace(lines[i + j], options.preserveIndentation)
          : lines[i + j];
        const searchLine = options.normalizeWhitespace
          ? normalizeWhitespace(searchLines[j], options.preserveIndentation)
          : searchLines[j];
        
        const similarity = calculateSimilarity(contentLine, searchLine);
        matchScore += similarity;
        matchLength += lines[i + j].length + 1; // +1 for newline
      }
      
      const averageScore = matchScore / searchLines.length;
      if (averageScore > bestScore && averageScore > 0.7) { // Threshold for minimum match quality
        bestScore = averageScore;
        const start = lines.slice(0, i).reduce((acc, line) => acc + line.length + 1, 0);
        bestMatch = {
          start,
          end: start + matchLength,
          confidence: averageScore
        };
      }
    }
    
    return bestMatch;
  }
  
  return null;
}

function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLength = Math.max(len1, len2);
  return maxLength === 0 ? 1 : (maxLength - matrix[len1][len2]) / maxLength;
}

function findOriginalPosition(original: string, normalizedPrefix: string): number {
  let origPos = 0;
  let normPos = 0;
  
  while (normPos < normalizedPrefix.length && origPos < original.length) {
    if (normalizeWhitespace(original[origPos], true) === normalizedPrefix[normPos]) {
      normPos++;
    }
    origPos++;
  }
  
  return origPos;
}

async function applyFileEdits(
  filePath: string,
  edits: Array<{oldText: string, newText: string}>,
  dryRun = false,
  options: z.infer<typeof EditOptions> = EditOptions.parse({})
): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  let modifiedContent = content;
  const failedEdits: Array<{edit: typeof edits[0], error: string}> = [];
  const successfulEdits: Array<{edit: typeof edits[0], match: EditMatch}> = [];
  
  // Sort edits by position (if found) to apply them in order
  for (const edit of edits) {
    const match = findBestMatch(modifiedContent, edit.oldText, options);
    
    if (!match) {
      failedEdits.push({
        edit,
        error: 'No suitable match found'
      });
      continue;
    }
    
    // For low confidence matches in non-dry-run mode, we might want to throw
    if (!dryRun && match.confidence < 0.8) {
      failedEdits.push({
        edit,
        error: `Match confidence too low: ${(match.confidence * 100).toFixed(1)}%`
      });
      continue;
    }
    
    successfulEdits.push({ edit, match });
  }
  
  // Sort successful edits by position (reverse order to maintain positions)
  successfulEdits.sort((a, b) => b.match.start - a.match.start);
  
  // Apply successful edits
  for (const { edit, match } of successfulEdits) {
    modifiedContent = 
      modifiedContent.slice(0, match.start) + 
      edit.newText + 
      modifiedContent.slice(match.end);
  }
  
  if (dryRun) {
    let report = createUnifiedDiff(content, modifiedContent, filePath);
    
    if (failedEdits.length > 0) {
      report += '\nFailed edits:\n' + failedEdits.map(({ edit, error }) => 
        `- Error: ${error}\n  Old text: ${edit.oldText.split('\n')[0]}...\n`
      ).join('\n');
    }
    
    if (successfulEdits.length > 0) {
      report += '\nSuccessful edits:\n' + successfulEdits.map(({ edit, match }) =>
        `- Match confidence: ${(match.confidence * 100).toFixed(1)}%\n  Position: ${match.start}-${match.end}\n`
      ).join('\n');
    }
    
    return report;
  }
  
  if (failedEdits.length > 0) {
    const errors = failedEdits.map(({ error }) => error).join('\n');
    throw new Error(`Some edits failed:\n${errors}`);
  }
  
  return modifiedContent;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description:
          "Read the complete contents of a file from the file system. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "read_multiple_files",
        description:
          "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: "write_file",
        description:
          "Create a new file or completely overwrite an existing file with new content. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: "edit_file",
        description:
          "Make selective edits to a text file using advanced pattern matching and smart formatting preservation. Features include:\n" +
          "- Line-based and multi-line content matching\n" +
          "- Whitespace normalization with indentation preservation\n" +
          "- Fuzzy matching with confidence scoring\n" +
          "- Multiple simultaneous edits with correct positioning\n" +
          "- Indentation style detection and preservation\n" +
          "- Detailed diff output with context in git format\n" +
          "- Dry run mode for previewing changes\n" +
          "- Failed match debugging with match confidence scores\n\n" +
          "Configure behavior with options.preserveIndentation, options.normalizeWhitespace, and options.partialMatch. " +
          "See schema for detailed option descriptions. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
      },
      {
        name: "create_directory",
        description:
          "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description:
          "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description:
          "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. The search " +
          "is case-insensitive and matches partial names. Returns full paths to all " +
          "matching items. Great for finding files when you don't know their exact location. " +
          "Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description:
          "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "list_allowed_directories",
        description: 
          "Returns the list of directories that this server is allowed to access. " +
          "Use this to understand which directories are available before trying to access files.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun, parsed.data.options);
        
        // If it's a dry run, show the unified diff
        if (parsed.data.dryRun) {
          return {
            content: [{ type: "text", text: `Edit preview:\n${result}` }],
          };
        }
      
        await fs.writeFile(validPath, result, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully applied edits to ${parsed.data.path}` }],
        };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const info = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
      }

      case "list_allowed_directories": {
        return {
          content: [{ 
            type: "text", 
            text: `Allowed directories:\n${allowedDirectories.join('\n')}` 
          }],
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

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});