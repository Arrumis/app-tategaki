
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const listId = process.env.LIST_ID || 'list_1769433514500';
const LIST_FILE = path.join(DATA_DIR, 'favs', `${listId}.json`);
const NOVELS_DIR = path.join(DATA_DIR, 'novels');

async function main() {
    console.log('Reading list file:', LIST_FILE);
    const content = await fs.readFile(LIST_FILE, 'utf-8');
    const list = JSON.parse(content);

    if (!list.novels || list.novels.length === 0) {
        console.log('List is empty.');
        return;
    }

    console.log(`Found ${list.novels.length} novels to remove.`);

    for (const novel of list.novels) {
        const novelPath = path.join(NOVELS_DIR, novel.site_type, novel.novel_id);
        console.log(`Removing directory: ${novelPath}`);
        try {
            await fs.rm(novelPath, { recursive: true, force: true });
            console.log('  -> Deleted.');
        } catch (e) {
            console.error('  -> Failed:', e.message);
        }
    }

    // Clear the list
    list.novels = [];
    await fs.writeFile(LIST_FILE, JSON.stringify(list, null, 2), 'utf-8');
    console.log('List cleared.');
}

main().catch(console.error);
