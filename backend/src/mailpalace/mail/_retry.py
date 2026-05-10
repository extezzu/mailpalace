"""Retry helpers for transient Gmail API failures.

Inbox Zero (`apps/web/utils/gmail/retry.ts`) wraps every Gmail call in
`p-retry` with exponential backoff for 429s and 5xx. Without it the first
ingest of a few hundred messages reliably trips Gmail's per-user rate
limits and our triage queue silently loses rows. This module is the
Python analogue, kept inline so we don't add a runtime dep just for one
small policy.

Retries 429 (rate limit), 500/502/503/504 (transient server). Any other
HttpError or non-HTTP exception bubbles up unchanged so genuine bugs
fail loudly instead of being masked by silent backoff.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import TypeVar

from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

T = TypeVar("T")

_RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})
_DEFAULT_MAX_ATTEMPTS = 5
_DEFAULT_BASE_DELAY = 0.5
_DEFAULT_MAX_DELAY = 30.0


def with_gmail_retry(
    fn: Callable[[], T],
    *,
    label: str = "gmail",
    max_attempts: int = _DEFAULT_MAX_ATTEMPTS,
) -> T:
    """Run ``fn``, retrying on Gmail rate limits and transient server errors.

    Exponential backoff with full jitter, capped at 30s. The first attempt
    is immediate; subsequent attempts wait ``base * 2**(n-1)`` seconds.
    Caller passes a zero-arg lambda so we can reissue the request without
    re-binding the underlying googleapiclient request object (single-shot).
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except HttpError as exc:
            status = getattr(exc.resp, "status", 0)
            if status not in _RETRYABLE_STATUSES or attempt == max_attempts:
                raise
            last_exc = exc
        except (TimeoutError, ConnectionError) as exc:
            if attempt == max_attempts:
                raise
            last_exc = exc

        sleep_for = min(
            _DEFAULT_MAX_DELAY,
            _DEFAULT_BASE_DELAY * (2 ** (attempt - 1)),
        )
        sleep_for *= 0.5 + random.random() * 0.5  # full jitter band [0.5x, 1.0x]
        logger.info(
            "%s retry %d/%d after %.2fs (cause: %s)",
            label,
            attempt,
            max_attempts,
            sleep_for,
            last_exc,
        )
        time.sleep(sleep_for)

    assert last_exc is not None
    raise last_exc
