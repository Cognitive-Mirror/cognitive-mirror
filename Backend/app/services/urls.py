"""Evidence artifact links: validation and classification.

An artifact is a link to the work itself - a pull request, a design doc, a
ticket, a recording. It makes evidence checkable by the manager. Two rules:

  * Only absolute http(s) URLs are accepted. Anything else (javascript:, data:,
    file:) is refused outright, because these URLs are rendered as links.
  * `kind` is derived here from the host and path, never taken from the client,
    so a badge cannot claim a link is a GitHub PR when it is not.
"""

from __future__ import annotations

from urllib.parse import urlparse

MAX_ARTIFACTS = 6
MAX_URL_LENGTH = 2048
MAX_LABEL_LENGTH = 120

# (kind, host suffixes, optional path markers). First match wins.
_RULES: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("github", ("github.com", "gitlab.com", "bitbucket.org"), ()),
    ("video", ("loom.com", "youtube.com", "youtu.be", "vimeo.com", "zoom.us"), ()),
    ("ticket", ("atlassian.net", "jira.com", "linear.app", "app.asana.com", "trello.com"),
     ()),
    ("docs", ("docs.google.com", "drive.google.com", "notion.so", "notion.site",
              "confluence.com", "sharepoint.com", "onedrive.live.com", "quip.com",
              "dropbox.com", "figma.com", "miro.com"), ()),
)
_PATH_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ticket", ("/browse/", "/issues/", "/tickets/")),
    ("github", ("/pull/", "/merge_requests/", "/commit/")),
    ("docs", ("/wiki/", "/docs/", "/postmortem", "/document/")),
)

KINDS = ("github", "docs", "ticket", "video", "link")


class ArtifactError(ValueError):
    """An artifact the API refuses, with a message safe to return."""


def classify_url(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()
    for kind, hosts, _ in _RULES:
        if any(host == h or host.endswith("." + h) for h in hosts):
            return kind
    for kind, hints in _PATH_HINTS:
        if any(h in path for h in hints):
            return kind
    return "link"


def validate_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise ArtifactError("Artifact URL is empty.")
    if len(url) > MAX_URL_LENGTH:
        raise ArtifactError("Artifact URL is too long.")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ArtifactError("Artifact links must be absolute http(s) URLs.")
    return url


def classify_artifacts(raw: list[dict]) -> list[dict]:
    """Validate, de-duplicate and classify submitted artifacts."""
    if len(raw) > MAX_ARTIFACTS:
        raise ArtifactError(f"At most {MAX_ARTIFACTS} artifacts per submission.")
    out: list[dict] = []
    seen: set[str] = set()
    for entry in raw:
        url = validate_url(str(entry.get("url", "")))
        if url in seen:
            continue
        seen.add(url)
        label = str(entry.get("label") or "").strip()[:MAX_LABEL_LENGTH]
        out.append({"url": url, "kind": classify_url(url), "label": label})
    return out


__all__ = ["KINDS", "MAX_ARTIFACTS", "ArtifactError", "classify_artifacts", "classify_url"]
