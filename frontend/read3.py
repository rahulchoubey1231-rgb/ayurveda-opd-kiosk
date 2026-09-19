with open('frontend/src/app/upload-records/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()
start_idx = text.find('const handleFileUpload')
end_idx = text.find('const handleInjectSample', start_idx)
print(text[start_idx:end_idx])
