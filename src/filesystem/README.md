# Filesystem MCP Server

Node.js server implementing Model Context Protocol (MCP) for filesystem operations.

## Features

- Read/write files
- Create/list/delete directories
- Move files/directories
- Search files
- Get file metadata

## Usage

1. Install dependencies:
   ```
   npm install @modelcontextprotocol/sdk
   ```

2. Run server:
   ```
   node index.js
   ```

3. Server runs on stdio, communicate using MCP.

## API

### Resources

- `file://system`: File system operations interface

### Tools

1. `read_file`: Read file contents
2. `read_multiple_files`: Read multiple files
3. `write_file`: Create/overwrite file
4. `create_directory`: Create directory
5. `list_directory`: List directory contents
6. `delete_file`: Delete file/directory
7. `move_file`: Move/rename file/directory
8. `search_files`: Search files/directories
9. `get_file_info`: Get file metadata

## Implementation

- Uses `@modelcontextprotocol/sdk`
- Async file operations with `fs/promises`
- Type guards for argument validation
- Error handling and detailed descriptions

## Notes

- Careful with `delete_file` and `write_file` (overwrites existing)
- File paths can be absolute or relative
