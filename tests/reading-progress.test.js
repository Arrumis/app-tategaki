import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { getFavList, getReadingPosition, updateBookmark, updateHistory, writeJson } from '../src/lib/storage.js';

test('別端末が古い話や同じ話を開き直しても、再開位置と栞が保たれる', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tategaki-progress-'));
    const original = { ...config.paths };
    config.paths.favs = path.join(dir, 'favs');
    config.paths.users = path.join(dir, 'users');
    const site = 'narou';
    const id = 'n1234ab';
    const position = (ep_no, scroll_pos) => ({ ep_no, scroll_pos });
    try {
        await writeJson(path.join(config.paths.users, 'default', 'meta.json'), {
            lists: [{ id: 'default' }, { id: 'second' }]
        });
        for (const [list, ep, date] of [['default', 200, '2026-11-01'], ['second', 199, '2026-11-02']]) {
            await writeJson(path.join(config.paths.favs, `${list}.json`), {
                novels: [{ site_type: site, novel_id: id, history: { ...position(ep, -10), updated_at: date } }]
            });
        }
        assert.equal((await getReadingPosition(site, id)).history.ep_no, 200);

        await updateHistory(site, id, position(205, 0), true);
        await updateHistory(site, id, position(205, -450));
        await updateHistory(site, id, position(200, -200));
        await updateHistory(site, id, position(205, 0), true);
        await updateBookmark('default', id, position(200, -200), site);

        const { history, bookmark } = await getReadingPosition(site, id);
        assert.equal(history.ep_no, 205);
        assert.equal(history.scroll_pos, -450);
        assert.equal(bookmark.ep_no, 200);
        assert.equal(bookmark.scroll_pos, -200);
        for (const list of ['default', 'second']) {
            assert.deepEqual((await getFavList(list)).novels[0].history, history);
        }
    } finally {
        Object.assign(config.paths, original);
        await rm(dir, { recursive: true, force: true });
    }
});
