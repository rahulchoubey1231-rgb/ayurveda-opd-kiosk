with open('src/app/triage/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(295, 320):
    print(f"{i}: {lines[i].encode('unicode_escape').decode('utf-8')}")
