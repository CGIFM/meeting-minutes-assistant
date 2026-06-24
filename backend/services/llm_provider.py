import json
from abc import ABC, abstractmethod
from typing import AsyncIterator

import httpx


class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(self, messages: list[dict], model: str) -> AsyncIterator[str]:
        ...

    @abstractmethod
    def default_model(self) -> str:
        ...


class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1/messages"

    def default_model(self) -> str:
        return "claude-sonnet-4-20250514"

    async def stream_chat(self, messages: list[dict], model: str = None) -> AsyncIterator[str]:
        model = model or self.default_model()
        system_msg = None
        chat_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                chat_messages.append(msg)

        body = {
            "model": model,
            "max_tokens": 8192,
            "messages": chat_messages,
            "stream": True,
        }
        if system_msg:
            body["system"] = system_msg

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", self.base_url, json=body, headers=headers) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                            if event.get("type") == "content_block_delta":
                                delta = event.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    yield delta["text"]
                        except json.JSONDecodeError:
                            continue


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.base_url = base_url

    def default_model(self) -> str:
        return "gpt-4o"

    async def stream_chat(self, messages: list[dict], model: str = None) -> AsyncIterator[str]:
        model = model or self.default_model()
        body = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", f"{self.base_url}/chat/completions", json=body, headers=headers) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                            delta = event["choices"][0].get("delta", {})
                            if "content" in delta:
                                yield delta["content"]
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def default_model(self) -> str:
        return "gemini-2.5-flash"

    async def stream_chat(self, messages: list[dict], model: str = None) -> AsyncIterator[str]:
        model = model or self.default_model()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={self.api_key}&alt=sse"

        contents = []
        system_instruction = None
        for msg in messages:
            if msg["role"] == "system":
                system_instruction = {"parts": [{"text": msg["content"]}]}
            else:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        body = {"contents": contents}
        if system_instruction:
            body["system_instruction"] = system_instruction

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, json=body) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                            for part in parts:
                                if "text" in part:
                                    yield part["text"]
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url

    def default_model(self) -> str:
        return "qwen3:8b"

    async def stream_chat(self, messages: list[dict], model: str = None) -> AsyncIterator[str]:
        model = model or self.default_model()
        body = {
            "model": model,
            "messages": messages,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=body) as resp:
                async for line in resp.aiter_lines():
                    if line.strip():
                        try:
                            data = json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue


def create_provider(provider_name: str, api_key: str = "", base_url: str = "") -> LLMProvider:
    if provider_name == "claude":
        return ClaudeProvider(api_key)
    elif provider_name == "openai":
        return OpenAIProvider(api_key, base_url or "https://api.openai.com/v1")
    elif provider_name == "gemini":
        return GeminiProvider(api_key)
    elif provider_name == "ollama":
        return OllamaProvider(base_url or "http://localhost:11434")
    else:
        raise ValueError(f"不支持的提供商: {provider_name}")
