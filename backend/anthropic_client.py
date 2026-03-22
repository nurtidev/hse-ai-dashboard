"""
Singleton Anthropic client — создаётся один раз при старте приложения.
Все роутеры должны использовать get_client() вместо anthropic.Anthropic().
"""
from __future__ import annotations

import os

import anthropic

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    """Возвращает единственный экземпляр Anthropic клиента."""
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY не задан в переменных окружения")
        _client = anthropic.Anthropic(api_key=key)
    return _client
