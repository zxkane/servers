#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import {
  GitHubContent,
  GitHubCreateUpdateFileResponse,
  GitHubSearchResponse,
  GitHubRepository,
  GitHubTree,
  GitHubCommit,
  GitHubReference,
  CreateRepositoryOptions,
  FileOperation,
  CreateTreeParams,
  GitHubPullRequest,
  CreateIssueOptions,
  CreatePullRequestOptions,
  GitHubIssue,
  GitHubFork,
  CreateBranchOptions,
} from './interfaces.js';

const server = new Server({
  name: "github-mcp-server",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {}
  }
});

const GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!GITHUB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}

async function forkRepository(
  owner: string,
  repo: string,
  organization?: string
): Promise<GitHubFork> {
  const url = organization 
    ? `https://api.github.com/repos/${owner}/${repo}/forks?organization=${organization}`
    : `https://api.github.com/repos/${owner}/${repo}/forks`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubFork;
}

async function createBranch(
  owner: string,
  repo: string,
  options: CreateBranchOptions
): Promise<GitHubReference> {
  // The ref needs to be in the format "refs/heads/branch-name"
  const fullRef = `refs/heads/${options.ref}`;
  
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: fullRef,
        sha: options.sha
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubReference;
}

// Helper function to get the default branch SHA
async function getDefaultBranchSHA(
  owner: string,
  repo: string
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`,
    {
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server"
      }
    }
  );

  // If main branch doesn't exist, try master
  if (!response.ok) {
    const masterResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/master`,
      {
        headers: {
          "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "github-mcp-server"
        }
      }
    );

    if (!masterResponse.ok) {
      throw new Error("Could not find default branch (tried 'main' and 'master')");
    }

    const data = await masterResponse.json() as GitHubReference;
    return data.object.sha;
  }

  const data = await response.json() as GitHubReference;
  return data.object.sha;
}

async function getFileContents(owner: string, repo: string, path: string, branch?: string): Promise<GitHubContent> {
  let url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  if (branch) {
    url += `?ref=${branch}`;
  }

  const response = await fetch(url, {
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorData}`);
  }

  const data = await response.json() as GitHubContent;
  
  // If it's a file, decode the content
  if (!Array.isArray(data) && data.content) {
    return {
      ...data,
      content: Buffer.from(data.content, 'base64').toString('utf8')
    };
  }

  return data;
}


async function createIssue(
  owner: string,
  repo: string,
  options: CreateIssueOptions
): Promise<GitHubIssue> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubIssue;
}

async function createPullRequest(
  owner: string,
  repo: string,
  options: CreatePullRequestOptions
): Promise<GitHubPullRequest> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubPullRequest;
}

async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<GitHubCreateUpdateFileResponse> {
  // Properly encode content to base64
  const encodedContent = Buffer.from(content).toString('base64');

  let currentSha = sha;
  if (!currentSha) {
    // Try to get current file SHA if it exists in the specified branch
    try {
      const existingFile = await getFileContents(owner, repo, path, branch);
      if (!Array.isArray(existingFile)) {
        currentSha = existingFile.sha;
      }
    } catch (error) {
      // File doesn't exist in this branch, which is fine for creation
      console.error('Note: File does not exist in branch, will create new file');
    }
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  const body = {
    message,
    content: encodedContent,
    branch,
    ...(currentSha ? { sha: currentSha } : {})
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorData}`);
  }

  return await response.json() as GitHubCreateUpdateFileResponse;
}

async function createTree(
  owner: string,
  repo: string,
  files: FileOperation[],
  baseTree?: string
): Promise<GitHubTree> {
  const tree: CreateTreeParams[] = files.map(file => ({
    path: file.path,
    mode: '100644',
    type: 'blob',
    content: file.content
  }));

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tree,
        base_tree: baseTree
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubTree;
}

async function createCommit(
  owner: string,
  repo: string,
  message: string,
  tree: string,
  parents: string[]
): Promise<GitHubCommit> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        tree,
        parents
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubCommit;
}

async function updateReference(
  owner: string,
  repo: string,
  ref: string,
  sha: string
): Promise<GitHubReference> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/${ref}`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sha,
        force: true
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubReference;
}

async function pushFiles(
  owner: string,
  repo: string,
  branch: string,
  files: FileOperation[],
  message: string
): Promise<GitHubReference> {
  const refResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server"
      }
    }
  );

  if (!refResponse.ok) {
    throw new Error(`GitHub API error: ${refResponse.statusText}`);
  }

  const ref = await refResponse.json() as GitHubReference;
  const commitSha = ref.object.sha;

  const tree = await createTree(owner, repo, files, commitSha);
  const commit = await createCommit(owner, repo, message, tree.sha, [commitSha]);
  return await updateReference(owner, repo, `heads/${branch}`, commit.sha);
}

async function searchRepositories(
  query: string,
  page: number = 1,
  perPage: number = 30
): Promise<GitHubSearchResponse> {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.append("q", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubSearchResponse;
}

async function createRepository(options: CreateRepositoryOptions): Promise<GitHubRepository> {
  const response = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as GitHubRepository;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_or_update_file",
        description: "Create or update a single file in a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            path: {
              type: "string",
              description: "Path where to create/update the file"
            },
            content: {
              type: "string",
              description: "Content of the file"
            },
            message: {
              type: "string",
              description: "Commit message"
            },
            branch: {
              type: "string",
              description: "Branch to create/update the file in"
            },
            sha: {
              type: "string",
              description: "SHA of the file being replaced (required when updating existing files)"
            }
          },
          required: ["owner", "repo", "path", "content", "message", "branch"]
        }
      },      
      {
        name: "search_repositories",
        description: "Search for GitHub repositories",
        inputSchema: {
          type: "object",
          properties: {
            query: { 
              type: "string",
              description: "Search query (see GitHub search syntax)" 
            },
            page: {
              type: "number",
              description: "Page number for pagination (default: 1)"
            },
            perPage: {
              type: "number",
              description: "Number of results per page (default: 30, max: 100)"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "create_repository",
        description: "Create a new GitHub repository in your account",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Repository name"
            },
            description: {
              type: "string",
              description: "Repository description"
            },
            private: {
              type: "boolean",
              description: "Whether the repository should be private"
            },
            autoInit: {
              type: "boolean",
              description: "Initialize with README.md"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "get_file_contents",
        description: "Get the contents of a file or directory from a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            path: {
              type: "string",
              description: "Path to the file or directory"
            }
          },
          required: ["owner", "repo", "path"]
        }
      },
      {
        name: "push_files",
        description: "Push multiple files to a GitHub repository in a single commit",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            branch: {
              type: "string",
              description: "Branch to push to (e.g., 'main' or 'master')"
            },
            files: {
              type: "array",
              description: "Array of files to push",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "Path where to create the file"
                  },
                  content: {
                    type: "string",
                    description: "Content of the file"
                  }
                },
                required: ["path", "content"]
              }
            },
            message: {
              type: "string",
              description: "Commit message"
            }
          },
          required: ["owner", "repo", "branch", "files", "message"]
        }
      },
      {
        name: "create_issue",
        description: "Create a new issue in a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            title: {
              type: "string",
              description: "Issue title"
            },
            body: {
              type: "string",
              description: "Issue body/description"
            },
            assignees: {
              type: "array",
              items: { type: "string" },
              description: "Array of usernames to assign"
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Array of label names"
            },
            milestone: {
              type: "number",
              description: "Milestone number to assign"
            }
          },
          required: ["owner", "repo", "title"]
        }
      },
      {
        name: "create_pull_request",
        description: "Create a new pull request in a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            title: {
              type: "string",
              description: "Pull request title"
            },
            body: {
              type: "string",
              description: "Pull request body/description"
            },
            head: {
              type: "string",
              description: "The name of the branch where your changes are implemented"
            },
            base: {
              type: "string",
              description: "The name of the branch you want the changes pulled into"
            },
            draft: {
              type: "boolean",
              description: "Whether to create the pull request as a draft"
            },
            maintainer_can_modify: {
              type: "boolean",
              description: "Whether maintainers can modify the pull request"
            }
          },
          required: ["owner", "repo", "title", "head", "base"]
        }
      },
      {
        name: "fork_repository",
        description: "Fork a GitHub repository to your account or specified organization",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            organization: {
              type: "string",
              description: "Optional: organization to fork to (defaults to your personal account)"
            }
          },
          required: ["owner", "repo"]
        }
      },
      {
        name: "create_branch",
        description: "Create a new branch in a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)"
            },
            repo: {
              type: "string",
              description: "Repository name"
            },
            branch: {
              type: "string",
              description: "Name for the new branch"
            },
            from_branch: {
              type: "string",
              description: "Optional: source branch to create from (defaults to the repository's default branch)"
            }
          },
          required: ["owner", "repo", "branch"]
        }
      }
    ]
  };
  
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {

  if (request.params.name === "fork_repository") {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    const args = request.params.arguments as {
      owner: string;
      repo: string;
      organization?: string;
    };

    const fork = await forkRepository(args.owner, args.repo, args.organization);
    return { toolResult: fork };
  }

  if (request.params.name === "create_branch") {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    const args = request.params.arguments as {
      owner: string;
      repo: string;
      branch: string;
      from_branch?: string;
    };

    // If no source branch is specified, use the default branch
    let sha: string;
    if (args.from_branch) {
      const response = await fetch(
        `https://api.github.com/repos/${args.owner}/${args.repo}/git/refs/heads/${args.from_branch}`,
        {
          headers: {
            "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "github-mcp-server"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Source branch '${args.from_branch}' not found`);
      }

      const data = await response.json() as GitHubReference;
      sha = data.object.sha;
    } else {
      sha = await getDefaultBranchSHA(args.owner, args.repo);
    }

    const branch = await createBranch(args.owner, args.repo, {
      ref: args.branch,
      sha: sha
    });

    return { toolResult: branch };
  }
  if (request.params.name === "search_repositories") {
    const { query, page, perPage } = request.params.arguments as {
      query: string;
      page?: number;
      perPage?: number;
    };

    const results = await searchRepositories(query, page, perPage);
    return { toolResult: results };
  }

  if (request.params.name === "create_repository") {
    const options = request.params.arguments as CreateRepositoryOptions;
    const repository = await createRepository(options);
    return { toolResult: repository };
  }

  if (request.params.name === "get_file_contents") {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }
  
    const args = request.params.arguments as {
      owner: string;
      repo: string;
      path: string;
      branch?: string;
    };
  
    const contents = await getFileContents(args.owner, args.repo, args.path, args.branch);
    return { toolResult: contents };
  }
  
  if (request.params.name === "create_or_update_file") {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }
  
    const args = request.params.arguments as {
      owner: string;
      repo: string;
      path: string;
      content: string;
      message: string;
      branch: string;
      sha?: string;
    };
  
    try {
      const result = await createOrUpdateFile(
        args.owner,
        args.repo,
        args.path,
        args.content,
        args.message,
        args.branch,
        args.sha
      );
      return { toolResult: result };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create/update file: ${error.message}`);
      }
      throw error;
    }
  }


  if (request.params.name === "push_files") {
    const { owner, repo, branch, files, message } = request.params.arguments as {
      owner: string;
      repo: string;
      branch: string;
      files: FileOperation[];
      message: string;
    };

    const result = await pushFiles(owner, repo, branch, files, message);
    return { toolResult: result };
  }

if (request.params.name === "create_issue") {
  if (!request.params.arguments) {
    throw new Error("Arguments are required");
  }

  const args = request.params.arguments as {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    assignees?: string[];
    milestone?: number;
    labels?: string[];
  };

  const { owner, repo, ...options } = args;
  const issue = await createIssue(owner, repo, options);
  return { toolResult: issue };
}

if (request.params.name === "create_pull_request") {
  if (!request.params.arguments) {
    throw new Error("Arguments are required");
  }

  const args = request.params.arguments as {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
    maintainer_can_modify?: boolean;
    draft?: boolean;
  };

  const { owner, repo, ...options } = args;
  const pullRequest = await createPullRequest(owner, repo, options);
  return { toolResult: pullRequest };
}

  throw new Error("Tool not found");
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});