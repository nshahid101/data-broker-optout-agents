"""Every agent's model, wired through Portkey.

Reads PORTKEY_API_KEY from .env, and always uses gpt-6-luna — no other
model should ever appear in this project.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from portkey_ai import PORTKEY_GATEWAY_URL, createHeaders
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Prefer this project's own .env (how a clone of this repo should be set
# up — see .env.example). Fall back to a .env one level up: the teaching
# staff clones every submitted repo into one shared folder and places
# their own .env one directory above each clone, so the app must find the
# key there too. load_dotenv() never overwrites a variable that's already
# set, so whichever file sets PORTKEY_API_KEY first wins.
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT.parent / ".env")

MODEL_NAME = "gpt-6-luna"


def get_model() -> OpenAIChatModel:
    api_key = os.environ["PORTKEY_API_KEY"]
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=PORTKEY_GATEWAY_URL,
        default_headers=createHeaders(api_key=api_key),
    )
    # gpt-6-luna (served via azure-openai behind Portkey) rejects function
    # tools when reasoning_effort is set on /v1/chat/completions - every
    # agent in this project uses tools, so this must stay 'none'.
    return OpenAIChatModel(
        MODEL_NAME,
        provider=OpenAIProvider(openai_client=client),
        settings={"openai_reasoning_effort": "none"},
    )
