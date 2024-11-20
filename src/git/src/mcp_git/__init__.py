import logging
import json
import sys
import click
import anyio
import anyio.lowlevel
from pathlib import Path
from git.types import Sequence
from mcp.server import Server
from mcp.server.session import ServerSession
from mcp.server.stdio import stdio_server
from mcp.types import (
    ClientCapabilities,
    TextContent,
    Tool,
    EmbeddedResource,
    ImageContent,
    ListRootsResult,
    RootsCapability,
)
from enum import StrEnum
import git
from git.objects import Blob, Tree

from pydantic import BaseModel, Field
from typing import List, Optional


class ReadFileInput(BaseModel):
    repo_path: str
    file_path: str
    ref: str = "HEAD"


class ListFilesInput(BaseModel):
    repo_path: str
    path: str = ""
    ref: str = "HEAD"


class FileHistoryInput(BaseModel):
    repo_path: str
    file_path: str
    max_entries: int = 10


class CommitInput(BaseModel):
    repo_path: str
    message: str
    files: Optional[List[str]] = Field(
        None,
        description="List of files to stage and commit. If omitted, all changes will be staged.",
    )


class SearchCodeInput(BaseModel):
    repo_path: str
    query: str
    file_pattern: str = "*"
    ref: str = "HEAD"


class GetDiffInput(BaseModel):
    repo_path: str
    ref1: str
    ref2: str
    file_path: Optional[str] = None


class GetRepoStructureInput(BaseModel):
    repo_path: str
    ref: str = "HEAD"


class ListReposInput(BaseModel):
    pass


class GitLogInput(BaseModel):
    repo_path: str
    max_count: int = 10
    ref: str = "HEAD"


class ListBranchesInput(BaseModel):
    repo_path: str


class ListTagsInput(BaseModel):
    repo_path: str


class GitTools(StrEnum):
    READ_FILE = "git_read_file"
    LIST_FILES = "git_list_files"
    FILE_HISTORY = "git_file_history"
    COMMIT = "git_commit"
    SEARCH_CODE = "git_search_code"
    GET_DIFF = "git_get_diff"
    GET_REPO_STRUCTURE = "git_get_repo_structure"
    LIST_REPOS = "git_list_repos"
    GIT_LOG = "git_log"
    LIST_BRANCHES = "git_list_branches"
    LIST_TAGS = "git_list_tags"


def git_read_file(repo: git.Repo, file_path: str, ref: str = "HEAD") -> str:
    tree = repo.commit(ref).tree
    blob = tree / file_path
    try:
        return blob.data_stream.read().decode("utf-8", errors="replace")
    except UnicodeDecodeError:
        # If it's a binary file, return a message indicating that
        return "[Binary file content not shown]"


def git_list_files(repo: git.Repo, path: str = "", ref: str = "HEAD") -> Sequence[str]:
    tree = repo.commit(ref).tree
    if path:
        tree = tree / path
    # Use traverse() and isinstance() to get only blobs (files) recursively
    return [str(o.path) for o in tree.traverse() if isinstance(o, Blob)]


def git_file_history(
    repo: git.Repo, file_path: str, max_entries: int = 10
) -> Sequence[str]:
    commits = list(repo.iter_commits(paths=file_path, max_count=max_entries))
    history = []
    for commit in commits:
        history.append(
            f"Commit: {commit.hexsha}\n"
            f"Author: {commit.author}\n"
            f"Date: {commit.authored_datetime}\n"
            f"Message: {commit.message}\n"
        )
    return history


def git_commit(repo: git.Repo, message: str, files: list[str] | None = None) -> str:
    if files is not None:
        repo.index.add(files)
    else:
        repo.index.add("*")  # Stage all changes
    commit = repo.index.commit(message)
    return f"Changes committed successfully with hash {commit.hexsha}"


def git_search_code(
    repo: git.Repo, query: str, file_pattern: str = "*", ref: str = "HEAD"
) -> list[str]:
    results = []
    tree = repo.commit(ref).tree
    for blob in tree.traverse():
        if isinstance(blob, Blob) and Path(blob.path).match(file_pattern):
            try:
                content = blob.data_stream.read().decode("utf-8", errors="replace")
                for i, line in enumerate(content.splitlines()):
                    if query in line:
                        results.append(f"{blob.path}:{i+1}: {line}")
            except UnicodeDecodeError:
                # Skip binary files
                continue
    return results


def git_get_diff(
    repo: git.Repo, ref1: str, ref2: str, file_path: str | None = None
) -> str:
    if file_path:
        return repo.git.diff(ref1, ref2, "--", file_path)
    return repo.git.diff(ref1, ref2)


def git_get_repo_structure(repo: git.Repo, ref: str = "HEAD") -> str:
    tree = repo.commit(ref).tree

    def build_tree(tree_obj: Tree) -> dict:
        result = {}
        for item in tree_obj:
            if isinstance(item, Tree):
                result[item.name] = build_tree(item)
            else:
                result[item.name] = item.type
        return result

    structure = build_tree(tree)
    return str(structure)


def git_log(repo: git.Repo, max_count: int = 10, ref: str = "HEAD") -> list[str]:
    commits = list(repo.iter_commits(ref, max_count=max_count))
    log = []
    for commit in commits:
        log.append(
            f"Commit: {commit.hexsha}\n"
            f"Author: {commit.author}\n"
            f"Date: {commit.authored_datetime}\n"
            f"Message: {commit.message}\n"
        )
    return log


def git_list_branches(repo: git.Repo) -> list[str]:
    return [str(branch) for branch in repo.branches]


def git_list_tags(repo: git.Repo) -> list[str]:
    return [str(tag) for tag in repo.tags]


async def serve(repository: Path | None) -> None:
    # Set up logging
    logger = logging.getLogger(__name__)

    if repository is not None:
        try:
            git.Repo(repository)
            logger.info(f"Using repository at {repository}")
        except git.InvalidGitRepositoryError:
            logger.error(f"{repository} is not a valid Git repository")
            return

    # Create server
    server = Server("mcp-git")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=GitTools.READ_FILE,
                description="Retrieves and returns the content of a specified file from "
                "a Git repository at a given reference (commit, branch, or tag). This "
                "allows you to view file contents at any point in the repository's "
                "history.",
                inputSchema=ReadFileInput.schema(),
            ),
            Tool(
                name=GitTools.LIST_FILES,
                description="Enumerates all files in a Git repository or a specific "
                "directory within the repository. This tool can be used to explore the "
                "file structure of a project at a particular reference.",
                inputSchema=ListFilesInput.schema(),
            ),
            Tool(
                name=GitTools.FILE_HISTORY,
                description="Retrieves the commit history for a specific file, showing "
                "how it has changed over time. This includes commit hashes, authors, "
                "dates, and commit messages, allowing you to track the evolution of a "
                "file.",
                inputSchema=FileHistoryInput.schema(),
            ),
            Tool(
                name=GitTools.COMMIT,
                description="Commits changes to the repository. You can "
                "specify particular files to commit or commit all staged changes. This "
                "tool allows you to create new snapshots of your project with "
                "descriptive commit messages.",
                inputSchema=CommitInput.schema(),
            ),
            Tool(
                name=GitTools.SEARCH_CODE,
                description="Searches for specific patterns or text across all files in "
                "the repository. This powerful tool allows you to find occurrences of "
                "code, comments, or any text within your project, optionally filtering "
                "by file patterns and at a specific reference.",
                inputSchema=SearchCodeInput.schema(),
            ),
            Tool(
                name=GitTools.GET_DIFF,
                description="Computes and displays the differences between two Git "
                "references (commits, branches, or tags). This tool is crucial for "
                "understanding changes between different versions of your codebase, "
                "optionally focusing on a specific file.",
                inputSchema=GetDiffInput.schema(),
            ),
            Tool(
                name=GitTools.GET_REPO_STRUCTURE,
                description="Generates a representation of the repository's file and "
                "directory structure at a given reference. This provides a high-level "
                "overview of your project's organization, helping you understand the "
                "layout of your codebase.",
                inputSchema=GetRepoStructureInput.schema(),
            ),
            Tool(
                name=GitTools.LIST_REPOS,
                description="Enumerates all available Git repositories from the "
                "specified roots. This tool helps you manage and navigate multiple "
                "repositories, providing a comprehensive list of Git projects "
                "accessible to the current session.",
                inputSchema=ListReposInput.schema(),
            ),
            Tool(
                name=GitTools.GIT_LOG,
                description="Retrieves the commit log for the repository, showing the "
                "history of commits including commit hashes, authors, dates, and "
                "commit messages. This tool provides an overview of the project's "
                "development history.",
                inputSchema=GitLogInput.schema(),
            ),
            Tool(
                name=GitTools.LIST_BRANCHES,
                description="Lists all branches in the Git repository. This tool "
                "provides an overview of the different lines of development in the "
                "project.",
                inputSchema=ListBranchesInput.schema(),
            ),
            Tool(
                name=GitTools.LIST_TAGS,
                description="Lists all tags in the Git repository. This tool "
                "provides an overview of the tagged versions or releases in the "
                "project.",
                inputSchema=ListTagsInput.schema(),
            ),
        ]

    async def list_repos() -> Sequence[str]:
        async def by_roots() -> Sequence[str]:
            if not isinstance(server.request_context.session, ServerSession):
                raise TypeError(
                    "server.request_context.session must be a ServerSession"
                )

            if not server.request_context.session.check_client_capability(
                ClientCapabilities(roots=RootsCapability())
            ):
                return []

            roots_result: ListRootsResult = (
                await server.request_context.session.list_roots()
            )
            logger.debug(f"Roots result: {roots_result}")
            repo_paths = []
            for root in roots_result.roots:
                path = root.uri.path
                try:
                    # Verify this is a git repo
                    git.Repo(path)
                    repo_paths.append(str(path))
                except git.InvalidGitRepositoryError:
                    pass
            return repo_paths

        def by_commandline() -> Sequence[str]:
            return [str(repository)] if repository is not None else []

        cmd_repos = by_commandline()
        root_repos = await by_roots()
        return [*root_repos, *cmd_repos]

    @server.call_tool()
    async def call_tool(
        name: str, arguments: dict
    ) -> list[TextContent | ImageContent | EmbeddedResource]:
        if name == GitTools.LIST_REPOS:
            result = await list_repos()
            logging.debug(f"repos={result}")
            return [
                TextContent(
                    type="text",
                    text=f"Here is some JSON that contains a list of git repositories: {json.dumps(result)}",
                )
            ]

        repo_path = Path(arguments["repo_path"])
        repo = git.Repo(repo_path)

        match name:
            case GitTools.READ_FILE:
                content = git_read_file(
                    repo, arguments["file_path"], arguments.get("ref", "HEAD")
                )
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains the contents of a file: {json.dumps({'content': content})}",
                    )
                ]

            case GitTools.LIST_FILES:
                files = git_list_files(
                    repo, arguments.get("path", ""), arguments.get("ref", "HEAD")
                )
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains a list of files: {json.dumps({'files': list(files)})}",
                    )
                ]

            case GitTools.FILE_HISTORY:
                history = git_file_history(
                    repo, arguments["file_path"], arguments.get("max_entries", 10)
                )
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains a file's history: {json.dumps({'history': list(history)})}",
                    )
                ]

            case GitTools.COMMIT:
                result = git_commit(repo, arguments["message"], arguments.get("files"))
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains the commit result: {json.dumps({'result': result})}",
                    )
                ]

            case GitTools.SEARCH_CODE:
                results = git_search_code(
                    repo,
                    arguments["query"],
                    arguments.get("file_pattern", "*"),
                    arguments.get("ref", "HEAD"),
                )
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains code search matches: {json.dumps({'matches': results})}",
                    )
                ]

            case GitTools.GET_DIFF:
                diff = git_get_diff(
                    repo,
                    arguments["ref1"],
                    arguments["ref2"],
                    arguments.get("file_path"),
                )
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains a diff: {json.dumps({'diff': diff})}",
                    )
                ]

            case GitTools.GET_REPO_STRUCTURE:
                structure = git_get_repo_structure(repo, arguments.get("ref", "HEAD"))
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains the repository structure: {json.dumps({'structure': structure})}",
                    )
                ]

            case GitTools.GIT_LOG:
                log = git_log(
                    repo, arguments.get("max_count", 10), arguments.get("ref", "HEAD")
                )
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains the git log: {json.dumps({'log': log})}",
                    )
                ]

            case GitTools.LIST_BRANCHES:
                branches = git_list_branches(repo)
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains a list of branches: {json.dumps({'branches': branches})}",
                    )
                ]

            case GitTools.LIST_TAGS:
                tags = git_list_tags(repo)
                return [
                    TextContent(
                        type="text",
                        text=f"Here is some JSON that contains a list of tags: {json.dumps({'tags': tags})}",
                    )
                ]

            case _:
                raise ValueError(f"Unknown tool: {name}")

    # Run the server
    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)


@click.command()
@click.option("-r", "--repository", type=click.Path(path_type=Path, dir_okay=True))
@click.option("-v", "--verbose", count=True)
def main(repository: Path | None, verbose: int):
    logging_level = logging.WARN
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG
    logging.basicConfig(level=logging_level, stream=sys.stderr)
    anyio.run(serve, repository)


if __name__ == "__main__":
    main()
