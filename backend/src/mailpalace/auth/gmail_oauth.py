"""Gmail OAuth2 installed-app flow.

Uses ``google-auth-oauthlib`` with a localhost loopback redirect. The
client_id / client_secret come from a Google Cloud "Desktop app" credential
saved to ``~/.mailpalace/google_credentials.json``. Refresh tokens land in
the OS keyring under service name ``mailpalace``.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from mailpalace.auth import secrets as secrets_store
from mailpalace.config import get_settings

logger = logging.getLogger(__name__)

# Read-only is enough for v0.1 surfacing. v0.2 adds gmail.modify so the
# bidirectional sync (mark-read, archive, trash) propagates upstream.
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


def _load_client_config_path() -> Path | None:
    """Return the resolved credentials path, or None when no file is set up."""
    settings = get_settings()
    return settings.resolved_google_credentials


def _load_client_config() -> dict[str, Any]:
    path = _load_client_config_path()
    if path is None:
        raise FileNotFoundError(
            "Google credentials file not found. Save it to "
            "~/.mailpalace/google_credentials.json or set "
            "MAILPALACE_GOOGLE_CREDENTIALS_FILE."
        )
    with Path(path).open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if "installed" in data:
        return data
    raise ValueError(
        "Expected an 'installed' app credential JSON. Re-create the "
        "OAuth client as 'Desktop app' in Google Cloud Console."
    )


def run_install_flow(
    _on_url: Callable[[str], None] | None = None,
) -> tuple[Credentials, dict[str, Any]]:
    """Open the local browser, return fresh credentials + the user profile.

    Blocks until the user approves the consent screen. The Google client
    library spawns a one-off localhost listener for the redirect.

    The ``_on_url`` parameter is ignored. Earlier versions tried to pre-
    publish the consent URL by pre-setting ``flow.redirect_uri`` and
    calling ``authorization_url()`` ahead of ``run_local_server``, but
    ``run_local_server`` overwrites ``redirect_uri`` with its real bound
    port, so the published URL was permanently broken (redirect_uri=
    http://localhost:0). Tomorrow we move to a backend /oauth/callback
    route + window.open from the frontend; for now we let the library do
    its own redirect URI and browser launch.
    """
    client_config = _load_client_config()
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True)
    profile = build("gmail", "v1", credentials=creds).users().getProfile(userId="me").execute()
    return creds, profile


def store_refresh_token(email: str, creds: Credentials) -> None:
    if not creds.refresh_token:
        raise RuntimeError("Google did not return a refresh token; revoke and retry the consent screen.")
    secrets_store.store("gmail", email, creds.refresh_token)


def load_credentials(email: str) -> Credentials | None:
    refresh_token = secrets_store.load("gmail", email)
    if refresh_token is None:
        return None
    client_config = _load_client_config()["installed"]
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=client_config["token_uri"],
        client_id=client_config["client_id"],
        client_secret=client_config["client_secret"],
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds


def forget(email: str) -> None:
    secrets_store.forget("gmail", email)
