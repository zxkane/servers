// GitHub API Response Types
export interface GitHubErrorResponse {
    message: string;
    documentation_url?: string;
  }
  
  export interface GitHubFileContent {
    type: string;
    encoding: string;
    size: number;
    name: string;
    path: string;
    content: string;
    sha: string;
    url: string;
    git_url: string;
    html_url: string;
    download_url: string;
  }
  
  export interface GitHubDirectoryContent {
    type: string;
    size: number;
    name: string;
    path: string;
    sha: string;
    url: string;
    git_url: string;
    html_url: string;
    download_url: string | null;
  }
  
  export type GitHubContent = GitHubFileContent | GitHubDirectoryContent[];
  
  export interface GitHubCreateUpdateFileResponse {
    content: GitHubFileContent | null;
    commit: {
      sha: string;
      node_id: string;
      url: string;
      html_url: string;
      author: GitHubAuthor;
      committer: GitHubAuthor;
      message: string;
      tree: {
        sha: string;
        url: string;
      };
      parents: Array<{
        sha: string;
        url: string;
        html_url: string;
      }>;
    };
  }
  
  export interface GitHubAuthor {
    name: string;
    email: string;
    date: string;
  }
  
  export interface GitHubTree {
    sha: string;
    url: string;
    tree: Array<{
      path: string;
      mode: string;
      type: string;
      size?: number;
      sha: string;
      url: string;
    }>;
    truncated: boolean;
  }
  
  export interface GitHubCommit {
    sha: string;
    node_id: string;
    url: string;
    author: GitHubAuthor;
    committer: GitHubAuthor;
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    parents: Array<{
      sha: string;
      url: string;
    }>;
  }
  
  export interface GitHubReference {
    ref: string;
    node_id: string;
    url: string;
    object: {
      sha: string;
      type: string;
      url: string;
    };
  }
  
  export interface GitHubRepository {
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
    owner: {
      login: string;
      id: number;
      node_id: string;
      avatar_url: string;
      url: string;
      html_url: string;
      type: string;
    };
    html_url: string;
    description: string | null;
    fork: boolean;
    url: string;
    created_at: string;
    updated_at: string;
    pushed_at: string;
    git_url: string;
    ssh_url: string;
    clone_url: string;
    default_branch: string;
  }
  
  export interface GitHubSearchResponse {
    total_count: number;
    incomplete_results: boolean;
    items: GitHubRepository[];
  }
  
  // Request Types
  export interface CreateRepositoryOptions {
    name?: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
  }
  
  export interface CreateTreeParams {
    path: string;
    mode: '100644' | '100755' | '040000' | '160000' | '120000';
    type: 'blob' | 'tree' | 'commit';
    content?: string;
    sha?: string;
  }
  
  export interface FileOperation {
    path: string;
    content: string;
  }

export interface GitHubIssue {
    url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    html_url: string;
    id: number;
    node_id: string;
    number: number;
    title: string;
    user: {
      login: string;
      id: number;
      avatar_url: string;
      url: string;
      html_url: string;
    };
    labels: Array<{
      id: number;
      node_id: string;
      url: string;
      name: string;
      color: string;
      default: boolean;
      description?: string;
    }>;
    state: string;
    locked: boolean;
    assignee: null | {
      login: string;
      id: number;
      avatar_url: string;
      url: string;
      html_url: string;
    };
    assignees: Array<{
      login: string;
      id: number;
      avatar_url: string;
      url: string;
      html_url: string;
    }>;
    milestone: null | {
      url: string;
      html_url: string;
      labels_url: string;
      id: number;
      node_id: string;
      number: number;
      title: string;
      description: string;
      state: string;
    };
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    body: string;
  }
  
  export interface CreateIssueOptions {
    title: string;
    body?: string;
    assignees?: string[];
    milestone?: number;
    labels?: string[];
  }
  
  export interface GitHubPullRequest {
    url: string;
    id: number;
    node_id: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    issue_url: string;
    number: number;
    state: string;
    locked: boolean;
    title: string;
    user: {
      login: string;
      id: number;
      avatar_url: string;
      url: string;
      html_url: string;
    };
    body: string;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    merge_commit_sha: string;
    assignee: null | {
      login: string;
      id: number;
      avatar_url: string;
      url: string;
      html_url: string;
    };
    assignees: Array<{
      login: string;
      id: number;
      avatar_url: string;
      url: string;
      html_url: string;
    }>;
    head: {
      label: string;
      ref: string;
      sha: string;
      user: {
        login: string;
        id: number;
        avatar_url: string;
        url: string;
        html_url: string;
      };
      repo: GitHubRepository;
    };
    base: {
      label: string;
      ref: string;
      sha: string;
      user: {
        login: string;
        id: number;
        avatar_url: string;
        url: string;
        html_url: string;
      };
      repo: GitHubRepository;
    };
  }
  
  export interface CreatePullRequestOptions {
    title: string;
    body?: string;
    head: string;
    base: string;
    maintainer_can_modify?: boolean;
    draft?: boolean;
  }

  export interface GitHubFork extends GitHubRepository {
    // Fork specific fields
    parent: {
      name: string;
      full_name: string;
      owner: {
        login: string;
        id: number;
        avatar_url: string;
      };
      html_url: string;
    };
    source: {
      name: string;
      full_name: string;
      owner: {
        login: string;
        id: number;
        avatar_url: string;
      };
      html_url: string;
    };
  }
  
  export interface CreateBranchOptions {
    ref: string;  // The name for the new branch
    sha: string;  // The SHA of the commit to branch from
  }