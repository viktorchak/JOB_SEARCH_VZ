from __future__ import annotations

import json
from typing import Any

import google.genai as genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings


class GeminiGateway:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_model

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def run_tool(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        tool_name: str,
        tool_description: str,
        input_schema: dict[str, Any],
        max_tokens: int = 800,
    ) -> dict[str, Any]:
        prompt = (
            f"Task name: {tool_name}\n"
            f"Task description: {tool_description}\n\n"
            f"{user_prompt}"
        )
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_json_schema=input_schema,
                max_output_tokens=max_tokens,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        return self.extract_json(response.text, tool_name)

    @staticmethod
    def extract_json(payload: str, tool_name: str) -> dict[str, Any]:
        if not payload:
            raise ValueError(f"Gemini did not return JSON output for {tool_name}")
        return json.loads(payload)
