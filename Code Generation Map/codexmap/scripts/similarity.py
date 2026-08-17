# TODO: implement per SKILL.md
import json
import sys

import numpy as np


def cosine_similarity(first, second) -> float:
    left = np.array(first, dtype=float)
    right = np.array(second, dtype=float)
    left_norm = np.linalg.norm(left)
    right_norm = np.linalg.norm(right)

    if left_norm == 0 or right_norm == 0:
        return 0.0

    return float(np.dot(left, right) / (left_norm * right_norm))


def main() -> int:
    lines = [line.strip() for line in sys.stdin.readlines() if line.strip()]
    if len(lines) != 2:
      print("Expected two JSON arrays on stdin", file=sys.stderr)
      return 1

    first = json.loads(lines[0])
    second = json.loads(lines[1])
    print(cosine_similarity(first, second))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
