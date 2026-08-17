# TODO: implement per SKILL.md
import json
import os
import sys
import time

from openai import APIStatusError, OpenAI


def main() -> int:
    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 1

    client = OpenAI()
    text = sys.stdin.read()[:8000]

    for attempt in range(2):
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
            )
            print(json.dumps(response.data[0].embedding))
            return 0
        except APIStatusError as error:
            if error.status_code == 429 and attempt == 0:
                time.sleep(1)
                continue
            print(f"OpenAI API error: {error}", file=sys.stderr)
            return 1
        except Exception as error:  # pragma: no cover - defensive wrapper
            print(f"Embedding failed: {error}", file=sys.stderr)
            return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
