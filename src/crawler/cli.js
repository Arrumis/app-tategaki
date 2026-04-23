import { crawlNovel } from './manager.js';

// CLIエントリーポイント
const [, , siteType, novelId] = process.argv;

if (!siteType || !novelId) {
    console.log("Usage: node src/crawler/cli.js <site_type> <novel_id>");
    console.log("Example: node src/crawler/cli.js narou n4830bu");
    process.exit(1);
}

(async () => {
    try {
        await crawlNovel(siteType, novelId);
        process.exit(0);
    } catch (e) {
        console.error("Failed:", e);
        process.exit(1);
    }
})();
