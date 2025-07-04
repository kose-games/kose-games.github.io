// N-gram based search implementation for DuckDB

// テキストをn-gramに分割する関数
function generateNgrams(text, minN = 2, maxN = 3) {
    const ngrams = new Set();
    const lowerText = text.toLowerCase();
    
    // 単語境界で分割
    const words = lowerText.split(/\s+/);
    
    for (const word of words) {
        // 単語全体も追加
        ngrams.add(word);
        
        // 複数のn-gram長で生成
        for (let n = minN; n <= maxN; n++) {
            if (word.length >= n) {
                for (let i = 0; i <= word.length - n; i++) {
                    ngrams.add(word.substring(i, i + n));
                }
            }
        }
    }
    
    return Array.from(ngrams);
}

// n-gramインデックスを作成
async function createNgramIndex(conn) {
    console.log('🔨 Creating n-gram index...');
    
    try {
        // n-gramインデックステーブルを作成
        await conn.query(`
            CREATE TABLE IF NOT EXISTS game_ngrams (
                game_id INTEGER,
                ngram VARCHAR,
                PRIMARY KEY (game_id, ngram)
            );
        `);
        
        // インデックスをクリア
        await conn.query(`DELETE FROM game_ngrams;`);
        
        // ゲームデータを取得
        const games = await conn.query(`SELECT id, title, description, category FROM games;`);
        const gamesArray = games.toArray();
        
        // 各ゲームのn-gramを生成して挿入
        for (const game of gamesArray) {
            const text = `${game.title} ${game.description} ${game.category}`;
            const ngrams = generateNgrams(text, 2, 3);  // 2文字と3文字のn-gram
            
            // n-gramを一括挿入
            for (const ngram of ngrams) {
                await conn.query(`
                    INSERT INTO game_ngrams (game_id, ngram) 
                    VALUES (${game.id}, '${ngram.replace(/'/g, "''")}')
                    ON CONFLICT DO NOTHING;
                `);
            }
        }
        
        // インデックスを作成
        await conn.query(`CREATE INDEX IF NOT EXISTS idx_ngrams ON game_ngrams(ngram);`);
        
        console.log('✅ N-gram index created successfully');
        
        // 統計情報
        const stats = await conn.query(`
            SELECT COUNT(DISTINCT game_id) as games, COUNT(*) as total_ngrams 
            FROM game_ngrams;
        `);
        console.log('📊 N-gram stats:', stats.toArray()[0]);
        
    } catch (error) {
        console.error('❌ N-gram index creation failed:', error);
    }
}

// n-gramベースの検索
async function searchWithNgrams(conn, searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    const searchNgrams = generateNgrams(lowerSearchTerm, 2, 3);  // 検索語も2-3文字のn-gram
    
    if (searchNgrams.length === 0) {
        return [];
    }
    
    // n-gramの一致数でスコアを計算
    const ngramList = searchNgrams.map(ng => `'${ng.replace(/'/g, "''")}'`).join(',');
    
    const result = await conn.query(`
        WITH match_counts AS (
            SELECT 
                game_id,
                COUNT(DISTINCT ngram) as matches,
                COUNT(DISTINCT ngram) * 1.0 / ${searchNgrams.length} as score
            FROM game_ngrams
            WHERE ngram IN (${ngramList})
            GROUP BY game_id
        )
        SELECT 
            g.id,
            g.title,
            g.category,
            g.description,
            mc.score
        FROM games g
        JOIN match_counts mc ON g.id = mc.game_id
        WHERE mc.score > 0
        ORDER BY mc.score DESC, g.title;
    `);
    
    return result.toArray();
}

// グローバルに公開
window.createNgramIndex = createNgramIndex;
window.searchWithNgrams = searchWithNgrams;
window.generateNgrams = generateNgrams;