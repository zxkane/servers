# GitHub MCP Server

MCP Server for the GitHub API, enabling file operations, repository management, and more.

## Tools

1. `create_or_update_file`
   - Create or update a single file in a repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `path` (string): Path where to create/update the file
     - `content` (string): Content of the file
     - `message` (string): Commit message
     - `branch` (string): Branch to create/update the file in
     - `sha` (optional string): SHA of file being replaced (for updates)
   - Returns: File content and commit details

2. `push_files`
   - Push multiple files in a single commit
   - Inputs:
     - `owner` (string): Repository owner
     - `repo` (string): Repository name
     - `branch` (string): Branch to push to
     - `files` (array): Files to push, each with `path` and `content`
     - `message` (string): Commit message
   - Returns: Updated branch reference

3. `search_repositories`
   - Search for GitHub repositories
   - Inputs:
     - `query` (string): Search query
     - `page` (optional number): Page number for pagination
     - `perPage` (optional number): Results per page (max 100)
   - Returns: Repository search results

4. `create_repository`
   - Create a new GitHub repository
   - Inputs:
     - `name` (string): Repository name
     - `description` (optional string): Repository description
     - `private` (optional boolean): Whether repo should be private
     - `autoInit` (optional boolean): Initialize with README
   - Returns: Created repository details

5. `get_file_contents`
   - Get contents of a file or directory
   - Inputs:
     - `owner` (string): Repository owner
     - `repo` (string): Repository name
     - `path` (string): Path to file/directory
     - `branch` (optional string): Branch to get contents from
   - Returns: File/directory contents

6. `create_issue`
   - Create a new issue
   - Inputs:
     - `owner` (string): Repository owner
     - `repo` (string): Repository name
     - `title` (string): Issue title
     - `body` (optional string): Issue description
     - `assignees` (optional string[]): Usernames to assign
     - `labels` (optional string[]): Labels to add
     - `milestone` (optional number): Milestone number
   - Returns: Created issue details

7. `create_pull_request`
   - Create a new pull request
   - Inputs:
     - `owner` (string): Repository owner
     - `repo` (string): Repository name
     - `title` (string): PR title
     - `body` (optional string): PR description
     - `head` (string): Branch containing changes
     - `base` (string): Branch to merge into
     - `draft` (optional boolean): Create as draft PR
     - `maintainer_can_modify` (optional boolean): Allow maintainer edits
   - Returns: Created pull request details

8. `fork_repository`
   - Fork a repository
   - Inputs:
     - `owner` (string): Repository owner
     - `repo` (string): Repository name
     - `organization` (optional string): Organization to fork to
   - Returns: Forked repository details

9. `create_branch`
   - Create a new branch
   - Inputs:
     - `owner` (string): Repository owner
     - `repo` (string): Repository name
     - `branch` (string): Name for new branch
     - `from_branch` (optional string): Source branch (defaults to repo default)
   - Returns: Created branch reference

## Setup

1. Create a GitHub Personal Access Token with appropriate permissions:
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Create a token with required permissions (e.g., repo, workflow)
   - Copy the generated token

2. To use this with Claude Desktop, add the following to your `claude_desktop_config.json`:
   ```json
   {
     "mcp-server-github": {
       "command": "mcp-server-github",
       "env": {
         "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
       }
     }
   }
   ```

## Features

- **Automatic Branch Creation**: When creating/updating files or pushing changes, branches are automatically created if they don't exist
- **Comprehensive Error Handling**: Clear error messages for common issues
- **Git History Preservation**: Operations maintain proper Git history without force pushing
- **Batch Operations**: Support for both single-file and multi-file operations

## Error Handling

The server provides detailed error messages for common scenarios:
- Branch doesn't exist
- File not found
- Authentication issues
- API rate limiting
- Invalid input parameters

## Limitations

- Maximum file size limit of 100MB (GitHub limitation)
- API rate limits apply based on your GitHub account
- Some operations may require specific repository permissions
- Binary files must be base64 encoded
