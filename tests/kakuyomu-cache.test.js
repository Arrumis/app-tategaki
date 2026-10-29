import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import * as storage from '../src/lib/storage.js';

test('途中に話が追加されても別の本文を返さず、旧データを識別できる', async () => {
    const original = config.paths.novels;
    config.paths.novels = await fs.mkdtemp(path.join(os.tmpdir(), 'tategaki-test-'));
    const info = episodes => ({ chapters: [{ episodes }] });
    const ep = (ep_no, episode_id, ep_title) => ({ ep_no, episode_id, ep_title });
    try {
        await storage.saveNovelInfo('kakuyomu', '1', info([ep(1, 'a', '第一話'), ep(2, 'c', 'お知らせ')]));
        await storage.saveEpisode('kakuyomu', '1', 1, { ep_title: '第一話', content: '本文' });
        await storage.saveEpisode('kakuyomu', '1', 2, { ep_title: 'お知らせ', content: '告知' });
        await storage.saveNovelInfo('kakuyomu', '1', info([ep(1, 'a', '第一話'), ep(2, 'b', '第二話'), ep(3, 'c', 'お知らせ')]));
        assert.equal((await storage.readEpisode('kakuyomu', '1', 1)).episode_id, 'a');
        assert.equal(await storage.readEpisode('kakuyomu', '1', 2), null);
        await storage.saveEpisode('kakuyomu', '1', 2, { episode_id: 'b', ep_title: '第二話' });
        assert.equal((await storage.readEpisode('kakuyomu', '1', 2)).episode_id, 'b');
        assert.equal(await storage.readEpisode('kakuyomu', '1', 3), null);
        await storage.saveEpisode('narou', '1', 1, { ep_title: '第一話' });
        assert.equal((await storage.readEpisode('narou', '1', 1)).ep_title, '第一話');
    } finally {
        await fs.rm(config.paths.novels, { recursive: true, force: true });
        config.paths.novels = original;
    }
});
