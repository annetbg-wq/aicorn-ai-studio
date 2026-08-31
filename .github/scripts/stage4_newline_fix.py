from pathlib import Path

p = Path('e2e/chat-generation-flow.spec.cjs')
text = p.read_text()

for marker in ('const LIVE_CANARY_CONTENT_TS = [', 'const LIVE_CANARY_PRODUCT_DELTA_APP_TSX = ['):
    start = text.index(marker)
    end = text.index("].join('\\\\n');", start) + len("].join('\\\\n');")
    segment = text[start:end]
    if segment.count("\\\\n") < 1:
        raise SystemExit(f'no double-escaped newlines in {marker}')
    segment = segment.replace("\\\\n", r"\n")
    text = text[:start] + segment + text[end:]

p.write_text(text)
print('stage4 canary newline encoding fixed')
