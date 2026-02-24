"""
LLM Service
Handles all LLM API calls (OpenAI, Anthropic, Gemini, DeepSeek).
"""
import asyncio
from typing import Optional
from openai import AsyncOpenAI
import anthropic
from google import genai
from google.genai import types

from config import (
    DEEPSEEK_BASE_URL,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TEMPERATURE,
    DEFAULT_TIMEOUT
)
from models import LLMHeaders


async def llm_chat_openai(
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout_s: float = DEFAULT_TIMEOUT,
    base_url: str = None
) -> str:
    """Direct OpenAI/DeepSeek API call."""
    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout_s)
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False
    )
    return resp.choices[0].message.content


async def llm_chat_anthropic(
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout_s: float = DEFAULT_TIMEOUT
) -> str:
    """Direct Anthropic Claude API call."""
    client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout_s)
    message = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_prompt}
        ],
        temperature=temperature
    )
    return message.content[0].text


async def llm_chat_gemini(
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS
) -> str:
    """Direct Google Gemini API call using google-genai SDK."""
    client = genai.Client(api_key=api_key)
    
    response = await client.aio.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
            system_instruction=system_prompt
        )
    )
    return response.text


async def llm_chat(
    llm: LLMHeaders,
    system_prompt: str,
    user_prompt: str,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout_s: float = DEFAULT_TIMEOUT,
    top_p: float = 0.9
) -> str:
    """
    Unified LLM chat function supporting multiple providers.
    Direct API calls - no external framework dependency.
    """
    provider = llm.provider.lower()
    
    if provider in {"openai", "deepseek"}:
        base_url = DEEPSEEK_BASE_URL if provider == "deepseek" else None
        return await llm_chat_openai(
            api_key=llm.api_key,
            model=llm.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout_s=timeout_s,
            base_url=base_url
        )
    
    elif provider == "anthropic":
        return await llm_chat_anthropic(
            api_key=llm.api_key,
            model=llm.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout_s=timeout_s
        )
    
    elif provider == "gemini":
        return await llm_chat_gemini(
            api_key=llm.api_key,
            model=llm.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens
        )
    
    else:
        # Fallback to OpenAI-compatible API
        return await llm_chat_openai(
            api_key=llm.api_key,
            model=llm.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout_s=timeout_s
        )


async def llm_chat_fast(
    llm: LLMHeaders,
    system_prompt: str,
    user_prompt: str
) -> str:
    """Fast LLM call with reduced tokens and timeout."""
    return await llm_chat(
        llm,
        system_prompt,
        user_prompt,
        temperature=0.3,
        max_tokens=150,
        timeout_s=8.0
    )
