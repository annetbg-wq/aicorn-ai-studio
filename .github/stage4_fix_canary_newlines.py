from pathlib import Path

path = Path('e2e/chat-generation-flow.spec.cjs')
text = path.read_text(encoding='utf-8')
needle = "].join('\\\\n');\n\nconst LIVE_CANARY_PRODUCT_DELTA_APP_TSX = ["
replacement = "].join('\\n');\n\nconst LIVE_CANARY_PRODUCT_DELTA_APP_TSX = ["
if needle not in text:
    raise SystemExit('repaired content newline anchor not found')
text = text.replace(needle, replacement, 1)
path.write_text(text, encoding='utf-8')
