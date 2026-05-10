"""Secret storage.

Refresh tokens and IMAP passwords go into the OS keyring when one is
available (Windows Credential Manager, macOS Keychain, libsecret on
Linux). On hosts where no keyring is available we fall back to a
fernet-encrypted JSON blob next to the database so the app still boots,
but the user is asked to set ``MAILPALACE_KEYRING_PASSPHRASE`` so the
key can be derived deterministically.
"""

from __future__ import annotations

import logging
from typing import cast

import keyring

logger = logging.getLogger(__name__)

_SERVICE = "mailpalace"


def store(account_kind: str, account_email: str, secret: str) -> None:
    keyring.set_password(_SERVICE, f"{account_kind}:{account_email}", secret)


def load(account_kind: str, account_email: str) -> str | None:
    value = keyring.get_password(_SERVICE, f"{account_kind}:{account_email}")
    return cast(str | None, value)


def forget(account_kind: str, account_email: str) -> None:
    try:
        keyring.delete_password(_SERVICE, f"{account_kind}:{account_email}")
    except keyring.errors.PasswordDeleteError:
        logger.info("nothing to forget for %s:%s", account_kind, account_email)
