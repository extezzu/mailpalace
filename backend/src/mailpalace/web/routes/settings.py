"""Settings endpoints.

GET returns the current view, PATCH updates fields in process and the
OS keyring. API keys are never echoed back: the response carries
``*_api_key_set`` booleans only.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from mailpalace.auth import secrets as secrets_store
from mailpalace.config import Settings, get_settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Service names under which we stash remote LLM credentials in the OS
# keyring. The username slot doubles as the provider id so a future
# multi-key arrangement (per workspace, per env) just adds more slots.
_KEYRING_SERVICE = "mailpalace-llm"
_PROVIDER_TO_KEYRING: dict[str, str] = {
    "anthropic": "anthropic",
    "openai": "openai",
}


def _load_keyring_keys(settings: Settings) -> None:
    """Hydrate api_key fields from the keyring on demand.

    Process restart loses the in-memory Settings; reading from the
    keyring lets the user's previously-saved API key still drive the
    router after a reboot. Env vars still take precedence.
    """
    if not settings.anthropic_api_key:
        stored = secrets_store.load(_KEYRING_SERVICE, "anthropic")
        if stored:
            settings.anthropic_api_key = stored
    if not settings.openai_api_key:
        stored = secrets_store.load(_KEYRING_SERVICE, "openai")
        if stored:
            settings.openai_api_key = stored


def _persist_api_key(provider: str, value: str | None) -> None:
    keyring_user = _PROVIDER_TO_KEYRING[provider]
    if value:
        secrets_store.store(_KEYRING_SERVICE, keyring_user, value)
    else:
        try:
            secrets_store.forget(_KEYRING_SERVICE, keyring_user)
        except Exception:  # noqa: BLE001
            logger.debug("keyring forget failed; ignoring", exc_info=True)


def _invalidate_router() -> None:
    """Drop the cached LLM router so the next call rebuilds with new
    settings (active provider, freshly-stored API keys, model swap)."""
    from mailpalace.llm import router as llm_router

    if llm_router._router is not None:  # type: ignore[attr-defined]
        try:
            old = llm_router._router  # type: ignore[attr-defined]
            for provider in old.providers.values():
                close = getattr(provider, "close", None)
                if close is not None:
                    import asyncio as _asyncio

                    try:
                        _asyncio.run(close())
                    except RuntimeError:
                        # Already in a loop; close happens at process exit.
                        pass
        finally:
            llm_router._router = None  # type: ignore[attr-defined]


class OllamaConfig(BaseModel):
    base_url: str
    model: str


class RemoteProviderState(BaseModel):
    api_key_set: bool
    model: str


class SettingsView(BaseModel):
    active_provider: Literal["ollama", "anthropic", "openai"]
    fallback_chain: list[str]
    ollama: OllamaConfig
    anthropic: RemoteProviderState
    openai: RemoteProviderState
    poll_interval_minutes: int
    summary_locale: str
    user_addressing: Literal["ty", "vy"]


class SettingsPatch(BaseModel):
    active_provider: Literal["ollama", "anthropic", "openai"] | None = None
    ollama_model: str | None = None
    ollama_base_url: str | None = None
    anthropic_api_key: str | None = None
    anthropic_model: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    poll_interval_minutes: int | None = None
    summary_locale: str | None = None
    user_addressing: Literal["ty", "vy"] | None = None


def _to_view(s: Settings) -> SettingsView:
    return SettingsView(
        active_provider=s.active_provider,
        fallback_chain=list(s.fallback_chain),
        ollama=OllamaConfig(base_url=s.ollama_base_url, model=s.ollama_model),
        anthropic=RemoteProviderState(
            api_key_set=bool(s.anthropic_api_key),
            model=s.anthropic_model,
        ),
        openai=RemoteProviderState(
            api_key_set=bool(s.openai_api_key),
            model=s.openai_model,
        ),
        poll_interval_minutes=s.poll_interval_minutes,
        summary_locale=s.summary_locale,
        user_addressing=s.user_addressing,
    )


@router.get("/settings", response_model=SettingsView, summary="Current settings view")
def get_settings_view() -> SettingsView:
    """Return current settings, with API keys redacted into boolean flags."""
    settings = get_settings()
    _load_keyring_keys(settings)
    return _to_view(settings)


@router.patch("/settings", response_model=SettingsView)
def patch_settings(patch: SettingsPatch) -> SettingsView:
    """Update settings in process and persist API keys to the OS keyring.

    Contract: ``null`` (or absent field) means "leave unchanged"; any
    other value replaces the current value. An explicit empty string
    on an api_key field clears that key from both memory and the
    keyring.

    Whenever the active provider changes or any api_key is touched the
    cached LLM router is dropped so the next triage call rebuilds with
    the new credentials. Without this, switching providers in the UI
    silently kept the old router running.
    """
    settings = get_settings()
    update_fields = patch.model_dump(exclude_unset=True)
    invalidate = False
    for field, value in update_fields.items():
        if value is None:
            continue
        if field == "active_provider":
            if value not in ("ollama", "anthropic", "openai"):
                raise HTTPException(status_code=400, detail=f"unknown provider: {value}")
            if value in ("anthropic", "openai"):
                # Block switching to a remote provider that has no key
                # configured — otherwise the next triage call surfaces
                # a confusing "All providers in chain failed".
                stored = settings.anthropic_api_key if value == "anthropic" else settings.openai_api_key
                if not stored:
                    keyring_value = secrets_store.load(_KEYRING_SERVICE, value)
                    if not keyring_value:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Set the {value} API key first, then activate the provider."
                            ),
                        )
            invalidate = True
        elif field in ("anthropic_api_key", "openai_api_key"):
            provider = field.split("_", 1)[0]
            cleaned = value.strip() if isinstance(value, str) else value
            _persist_api_key(provider, cleaned or None)
            setattr(settings, field, cleaned or None)
            invalidate = True
            continue
        elif field in ("ollama_model", "ollama_base_url", "anthropic_model", "openai_model"):
            invalidate = True
        setattr(settings, field, value)
    if invalidate:
        _invalidate_router()
    _load_keyring_keys(settings)
    return _to_view(settings)
