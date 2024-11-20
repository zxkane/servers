# mcp-git

A Model Context Protocol server for Git repository interaction and automation. This server provides tools to read, search, and manipulate Git repositories via Large Language Models.

## Available Tools

- `git_read_file`: Read contents of a file at a specific Git reference
- `git_list_files`: List all files in a repository or subdirectory
- `git_file_history`: Get commit history for a specific file
- `git_commit`: Create Git commits with messages and specified files
- `git_search_code`: Search repository content with pattern matching
- `git_get_diff`: View diffs between Git references
- `git_get_repo_structure`: View repository file structure
- `git_list_repos`: List available Git repositories

## Installation

### Using uv

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-git*.

### Using PIP

Alternatively you can install `mcp-git` via pip:

```
pip install mcp-git
```

After installation, you can run it as a script using:

```
python -m mcp_git
```

## Configuration
### Configure for Claude.app

Add to your Claude settings:

```json
"mcpServers": {
  "mcp-git": {
    "command": "uvx",
    "args": ["mcp-git", "--repository", "path/to/git/repo"]
  }
}
```

Alternatively, if using pip installation:

```json
"mcpServers": {
  "mcp-git": {
    "command": "python",
    "args": ["-m", "mcp_git", "--repository", "path/to/git/repo"]
  }
}
```

### Configure for Zed

Add to your Zed settings.json:

```json
"context_servers": [
  "mcp-git": {
    "command": "uvx",
    "args": ["mcp-git"]
  }
],
```

Alternatively, if using pip installation:

```json
"context_servers": {
  "mcp-git": {
    "command": "python",
    "args": ["-m", "mcp-git"]
  }
},
```


## Contributing

For examples of other MCP servers and implementation patterns, see:
https://github.com/modelcontextprotocol/servers

Pull requests welcome!
