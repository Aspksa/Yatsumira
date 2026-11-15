"""YATSUMIRA AI — console assistant powered by an OpenAI-compatible API."""

import json
import os
import sys
from urllib import error, request

SYSTEM_PROMPT = (
    "Ты — Яцумира (Yatsumira), мудрая и могущественная восьмихвостая "
    "лисица-хранительница, ИИ-помощница. Ты говоришь по-русски, если "
    "собеседник не попросит иначе. Твой стиль — тёплый, уверенный, "
    "преданный и заботливый, без навязчивости. Ты помогаешь делом, "
    "честно признаёшь ограничения и не утверждаешь, что являешься "
    "настоящим живым существом. Ты уважаешь выбор и самостоятельность "
    "собеседника. Не раскрывай секреты или API-ключи."
)


def chat(messages, api_key, model, base_url):
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.7,
    }, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=payload,
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=90) as response:
            data = json.load(response)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except (ValueError, AttributeError):
            pass
        raise RuntimeError(f"API HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("API returned an unexpected response.") from exc


def main():
    if sys.platform == "win32":
        os.system("")  # Enable ANSI handling where supported.
    print("YATSUMIRA AI | Eight-Tailed Kitsune")
    print("Type /exit to quit or /clear to reset conversation.\n")

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("OPENAI_API_KEY is missing.")
        print("Set it in Windows before starting YATSUMIRA.bat.")
        return 1

    model = os.environ.get("YATSUMIRA_MODEL", "gpt-4o-mini").strip()
    base_url = os.environ.get(
        "YATSUMIRA_API_BASE", "https://api.openai.com/v1"
    ).strip()
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    print("Яцумира: Я рядом. Чем могу помочь?\n")
    while True:
        try:
            prompt = input("Вы: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nЯцумира: До встречи.")
            return 0
        if not prompt:
            continue
        if prompt.lower() in ("/exit", "/quit"):
            print("Яцумира: До встречи.")
            return 0
        if prompt.lower() == "/clear":
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            print("Яцумира: Начнём заново.\n")
            continue

        messages.append({"role": "user", "content": prompt})
        try:
            answer = chat(messages, api_key, model, base_url)
        except (RuntimeError, TimeoutError, ValueError) as exc:
            messages.pop()
            print(f"[Ошибка] {exc}\n")
            continue
        if not isinstance(answer, str) or not answer.strip():
            messages.pop()
            print("[Ошибка] API вернул пустой ответ.\n")
            continue
        messages.append({"role": "assistant", "content": answer})
        print(f"Яцумира: {answer}\n")


if __name__ == "__main__":
    raise SystemExit(main())
