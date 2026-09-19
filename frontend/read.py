with open('src/app/api/assistant/route.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(85, min(95, len(lines))):
    print(f"{i}: {lines[i].encode('unicode_escape').decode('utf-8')}")
