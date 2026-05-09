"""Offline language detection."""

from __future__ import annotations

import logging

try:
    import py3langid as langid
except ImportError:  # pragma: no cover
    langid = None

logger = logging.getLogger(__name__)

_DEFAULT_LANG = "en"
_SAMPLE_LIMIT = 2000


def detect_language(text: str) -> str:
    """Return an ISO 639-1 code for `text`.

    Falls back to ``"en"`` if py3langid is missing, the input is empty, or
    the classifier raises. Failures are logged so the caller can tell a
    correctly-classified English message apart from a silent crash.
    """
    if not text or langid is None:
        return _DEFAULT_LANG
    try:
        lang, _confidence = langid.classify(text[:_SAMPLE_LIMIT])
        return lang
    except Exception:
        logger.warning("py3langid classify failed; falling back to %s", _DEFAULT_LANG, exc_info=True)
        return _DEFAULT_LANG
