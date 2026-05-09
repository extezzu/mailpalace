"""Settings endpoints.

GET returns the current view, PATCH updates fields in process. API keys are
never echoed back: the response carries ``*_api_key_set`` booleans only.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from mailpalace.config import Settings, get_settings

router = APIRouter()


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
    summary_locale: Literal["ru", "en"]
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
    return _to_view(get_settings())


@router.patch("/settings", response_model=SettingsView)
def patch_settings(patch: SettingsPatch) -> SettingsView:
    """Update settings in process. v0.1 will persist into the settings table.

    Contract: ``null`` means "leave unchanged"; any other value (including the
    empty string) replaces the current value.
    """
    settings = get_settings()
    update_fields = patch.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if value is None:
            continue
        setattr(settings, field, value)
    return _to_view(settings)
