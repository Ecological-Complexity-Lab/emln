export async function saveSession(state) {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'session.json',
                types: [{ description: 'Session file', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Save session failed:', err);
        }
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = 'session.json';
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
    }
}

export async function loadSession(file) {
    const text = await file.text();
    return JSON.parse(text);
}

export async function loadSessionFromUrl(url) {
    const gistMatch = url.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)\/?$/i);
    const resolvedUrl = gistMatch
        ? `https://gist.githubusercontent.com/${gistMatch[1]}/${gistMatch[2]}/raw/`
        : url;
    const res = await fetch(resolvedUrl);
    if (!res.ok) throw new Error(`Failed to fetch session: ${res.status} ${res.statusText}`);
    return res.json();
}
