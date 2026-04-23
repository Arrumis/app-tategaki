import fs from 'fs';
import path from 'path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const config = {
    paths: {
        favs: path.join(dataDir, 'favs'),
        novels: path.join(dataDir, 'novels')
    }
};

async function check() {
    const jsonFiles = fs.readdirSync(config.paths.favs).filter(f => f.endsWith('.json'));
    const trackedIds = new Set();

    for (const file of jsonFiles) {
        const data = JSON.parse(fs.readFileSync(path.join(config.paths.favs, file), 'utf-8'));
        if (data.novels) {
            data.novels.forEach(n => trackedIds.add(n.novel_id));
        }
    }

    const sites = ['narou', 'kakuyomu'];
    const orphaned = [];

    for (const site of sites) {
        const sitePath = path.join(config.paths.novels, site);
        if (!fs.existsSync(sitePath)) continue;
        const dirs = fs.readdirSync(sitePath);
        for (const id of dirs) {
            if (!trackedIds.has(id)) {
                orphaned.push({ site, id });
            }
        }
    }

    console.log('Total tracked novel IDs:', trackedIds.size);
    console.log('Orphaned novels (on disk but not in any list):', orphaned.length);
    orphaned.forEach(o => console.log(` - ${o.site}/${o.id}`));
}

check();
