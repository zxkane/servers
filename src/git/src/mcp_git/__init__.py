import logging
import click
import anyio
import anyio.lowlevel
from pathlib import Path
from git.types import Sequence
from mcp_python.server import Server
from mcp_python.server.stdio import stdio_server
from mcp_python.types import Tool
from mcp_python.server.types import EmbeddedResource, ImageContent
from enum import StrEnum
import git
from git.objects import Blob, Tree
from mcp_python import ServerSession

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


class GitTools(StrEnum):
    READ_FILE = "git_read_file"
    LIST_FILES = "git_list_files"
    FILE_HISTORY = "git_file_history"
    COMMIT = "git_commit"
    SEARCH_CODE = "git_search_code"
    GET_DIFF = "git_get_diff"
    GET_REPO_STRUCTURE = "git_get_repo_structure"
    LIST_REPOS = "git_list_repos"


def git_read_file(repo: git.Repo, file_path: str, ref: str = "HEAD") -> str:
    tree = repo.commit(ref).tree
    blob = tree / file_path
    return blob.data_stream.read().decode("utf-8", errors="replace")


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
            content = blob.data_stream.read().decode("utf-8")
            for i, line in enumerate(content.splitlines()):
                if query in line:
                    results.append(f"{blob.path}:{i+1}: {line}")
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


async def serve(repository: Path | None) -> None:
    # Set up logging
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)

    if repository is not None:
        try:
            git.Repo(repository)
        except git.InvalidGitRepositoryError:
            logger.error(f"{repository} is not a valid Git repository")
            return

    # Create server
    server = Server("git-mcp")

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
        ]

    async def list_repos() -> Sequence[str]:
        async def by_roots() -> Sequence[str]:
            if not isinstance(server.request_context.session, ServerSession):
                raise TypeError(
                    "server.request_context.session must be a ServerSession"
                )

            roots_result = await server.request_context.session.list_roots()
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
    ) -> Sequence[str | ImageContent | EmbeddedResource]:
        if name == GitTools.LIST_REPOS:
            return await list_repos()

        repo_path = Path(arguments["repo_path"])
        repo = git.Repo(repo_path)

        match name:
            case GitTools.READ_FILE:
                return [
                    git_read_file(
                        repo, arguments["file_path"], arguments.get("ref", "HEAD")
                    )
                ]

            case GitTools.LIST_FILES:
                return [
                    str(f)
                    for f in git_list_files(
                        repo, arguments.get("path", ""), arguments.get("ref", "HEAD")
                    )
                ]

            case GitTools.FILE_HISTORY:
                return git_file_history(
                    repo, arguments["file_path"], arguments.get("max_entries", 10)
                )

            case GitTools.COMMIT:
                result = git_commit(repo, arguments["message"], arguments.get("files"))
                return [result]

            case GitTools.SEARCH_CODE:
                return git_search_code(
                    repo,
                    arguments["query"],
                    arguments.get("file_pattern", "*"),
                    arguments.get("ref", "HEAD"),
                )

            case GitTools.GET_DIFF:
                return [
                    git_get_diff(
                        repo,
                        arguments["ref1"],
                        arguments["ref2"],
                        arguments.get("file_path"),
                    )
                ]

            case GitTools.GET_REPO_STRUCTURE:
                return [git_get_repo_structure(repo, arguments.get("ref", "HEAD"))]

            case _:
                raise ValueError(f"Unknown tool: {name}")

    # Run the server
    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options)


@click.command()
@click.option("-r", "--repository", type=click.Path(path_type=Path, dir_okay=True))
def main(repository: Path | None):
    anyio.run(serve, repository)


if __name__ == "__main__":
    main()
