use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use rusqlite_migration::{Migrations, M};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};



#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ClipType {
    Text,
    Image,
    Html,
    Files,
}
impl ToString for ClipType {
    fn to_string(&self) -> String {
        match self {
            ClipType::Text => "text".to_string(),
            ClipType::Html => "html".to_string(),
            ClipType::Image => "image".to_string(),
            ClipType::Files => "files".to_string(),
        }
    }
}

impl From<String> for ClipType {
    fn from(s: String) -> Self {
        match s.as_str() {
            "html" => ClipType::Html,
            "image" => ClipType::Image,
            "files" => ClipType::Files,
            _ => ClipType::Text,
        }
    }
}

/// 列表项（轻量级，用于 UI 展示）
#[derive(Debug, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: i64,
    pub content_type: ClipType,
    pub preview: String,   // 预览文本
    pub created_at: i64,
    pub is_pinned: bool,
}


#[derive(Debug, Serialize, Deserialize)]
pub enum ClipData {
    Text(String),
    Html { text: String, html: String }, // HTML 通常包含纯文本 fallback
    Image(Vec<u8>),
    Files(Vec<String>), // 文件路径列表
}

pub struct Storage {
    conn: Connection,
    image_dir: PathBuf,
}

impl Storage {
    pub fn new<P: AsRef<Path>>(data_dir: P) -> Result<Self> {
        let data_dir = data_dir.as_ref().to_path_buf();
        let image_dir = data_dir.join("images");
        let db_path = data_dir.join("history.db");

        if !image_dir.exists() {
            fs::create_dir_all(&image_dir).context("Failed to create image dir")?;
        }

        let mut conn = Connection::open(&db_path).context("Failed to open DB")?;
        
        // 性能调优
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        Self::migrate(&mut conn)?;

        Ok(Self { conn, image_dir })
    }

    fn migrate(conn: &mut Connection) -> Result<()> {
        let migrations = Migrations::new(vec![
            M::up(r#"
                CREATE TABLE IF NOT EXISTS clips (
                    id INTEGER PRIMARY KEY,
                    type TEXT NOT NULL,
                    
                    -- 核心字段，不同类型存不同列
                    content_text TEXT,       -- 纯文本 / HTML的纯文本部分 / 文件列表的拼接字符串
                    content_html TEXT,       -- HTML 原始内容
                    content_image_path TEXT, -- 图片文件名
                    content_file_paths TEXT, -- JSON 格式的文件路径数组
                    
                    content_hash TEXT UNIQUE NOT NULL, -- 指纹
                    created_at INTEGER NOT NULL,
                    is_pinned BOOLEAN DEFAULT 0
                );

                -- FTS 全文搜索 (针对 content_text 建立索引)
                CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
                    content_text, 
                    content='clips', 
                    content_rowid='id'
                );

                -- 触发器：自动同步 FTS
                CREATE TRIGGER IF NOT EXISTS clips_ai AFTER INSERT ON clips BEGIN
                    INSERT INTO clips_fts(rowid, content_text) VALUES (new.id, new.content_text);
                END;
                CREATE TRIGGER IF NOT EXISTS clips_ad AFTER DELETE ON clips BEGIN
                    INSERT INTO clips_fts(clips_fts, rowid, content_text) VALUES('delete', old.id, old.content_text);
                END;
                CREATE TRIGGER IF NOT EXISTS clips_au AFTER UPDATE ON clips BEGIN
                    INSERT INTO clips_fts(clips_fts, rowid, content_text) VALUES('delete', old.id, old.content_text);
                    INSERT INTO clips_fts(rowid, content_text) VALUES (new.id, new.content_text);
                END;
            "#),
        ]);
        migrations.to_latest(conn)?;
        Ok(())
    }


    /// 1. 存纯文本
    pub fn add_text(&mut self, text: String) -> Result<i64> {
        let text = text.trim().to_string();
        if text.is_empty() { return Ok(0); }
        let hash = Self::compute_hash(text.as_bytes());

        let tx = self.conn.transaction()?;
        let id = Self::upsert_record(&tx, ClipType::Text, &hash, |sql, params| {
             // 动态构建插入
             tx.execute(sql, params)
        }, Some(&text), None, None, None)?;
        tx.commit()?;
        Ok(id)
    }

    /// 2. 存 HTML (同时存纯文本用于搜索)
    pub fn add_html(&mut self, text_preview: String, html_content: String) -> Result<i64> {
        // HTML 的指纹计算：建议用 html 内容算，或者 text+html 混合算
        let hash = Self::compute_hash(html_content.as_bytes());
        
        let tx = self.conn.transaction()?;
        let id = Self::upsert_record(&tx, ClipType::Html, &hash, |sql, params| {
             tx.execute(sql, params)
        }, Some(&text_preview), Some(&html_content), None, None)?;
        tx.commit()?;
        Ok(id)
    }

    /// 3. 存图片
    pub fn add_image(&mut self, image_bytes: Vec<u8>) -> Result<i64> {
        let hash = Self::compute_hash(&image_bytes);
        
        // 快速检查是否存在
        if let Some(id) = self.find_id_by_hash(&hash)? {
            self.touch_record(id)?;
            return Ok(id);
        }

        let file_name = format!("{}.png", hash);
        let file_path = self.image_dir.join(&file_name);
        
        let tx = self.conn.transaction()?;
        
        if !file_path.exists() {
            fs::write(&file_path, &image_bytes)?;
        }

        let id = Self::upsert_record(&tx, ClipType::Image, &hash, |sql, params| {
             tx.execute(sql, params)
        }, None, None, Some(&file_name), None)?;
        
        tx.commit()?;
        Ok(id)
    }

    /// 4. 存文件路径列表 (Vec<Path>)
    pub fn add_files(&mut self, paths: Vec<String>) -> Result<i64> {
        if paths.is_empty() { return Ok(0); }
        
        // 序列化为 JSON 存入 DB
        let json_str = serde_json::to_string(&paths)?;
        // 将所有文件名拼接成字符串，用于全文搜索
        // 比如: "C:\Users\Photo.jpg" -> 存入 content_text 以便能搜到 "Photo"
        let search_text = paths.join("\n"); 
        
        let hash = Self::compute_hash(json_str.as_bytes());

        let tx = self.conn.transaction()?;
        let id = Self::upsert_record(&tx, ClipType::Files, &hash, |sql, params| {
             tx.execute(sql, params)
        }, Some(&search_text), None, None, Some(&json_str))?;
        tx.commit()?;
        Ok(id)
    }

    /// 获取列表
    pub fn get_recent(&self, limit: usize, offset: usize) -> Result<Vec<ClipItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, type, content_text, content_file_paths, created_at, is_pinned 
             FROM clips 
             ORDER BY is_pinned DESC, created_at DESC 
             LIMIT ?1 OFFSET ?2"
        )?;

        let rows = stmt.query_map(params![limit, offset], |row| {
            let id: i64 = row.get(0)?;
            let type_str: String = row.get(1)?;
            let text: Option<String> = row.get(2)?;
            let files_json: Option<String> = row.get(3)?;
            let created_at: i64 = row.get(4)?;
            let is_pinned: bool = row.get(5)?;

            let content_type = ClipType::from(type_str);
            
            // 生成 UI 预览文字
            let preview = match content_type {
                ClipType::Text | ClipType::Html => {
                    text.unwrap_or_default().chars().take(100).collect::<String>().replace('\n', " ")
                },
                ClipType::Image => "[图片]".to_string(),
                ClipType::Files => {
                    // 尝试解析 JSON 看看有几个文件
                    if let Some(json) = files_json {
                        if let Ok(paths) = serde_json::from_str::<Vec<String>>(&json) {
                            format!("[文件] {} 个项目: {}", paths.len(), paths.first().unwrap_or(&"".to_string()))
                        } else {
                            "[文件列表]".to_string()
                        }
                    } else {
                        "[文件列表]".to_string()
                    }
                }
            };

            Ok(ClipItem {
                id,
                content_type,
                preview,
                created_at,
                is_pinned,
            })
        })?;

        let mut items = Vec::new();
        for row in rows { items.push(row?); }
        Ok(items)
    }

    /// 搜索 (所有类型都通过 content_text 搜索)
    pub fn search(&self, query: &str) -> Result<Vec<ClipItem>> {
        let safe_query = format!("\"{}\"", query.replace('"', ""));
        let mut stmt = self.conn.prepare(
            "SELECT id, type, content_text, content_file_paths, created_at, is_pinned 
             FROM clips 
             WHERE id IN (SELECT rowid FROM clips_fts WHERE clips_fts MATCH ?1)
             ORDER BY created_at DESC LIMIT 50"
        )?;
        
        // 映射逻辑同 get_recent，此处略去重复代码，实际代码需保留映射逻辑
        // ...
        let rows = stmt.query_map(params![safe_query], |row| {
             // 复制上面的 row mapping 逻辑
             let id: i64 = row.get(0)?;
             let type_str: String = row.get(1)?;
             let text: Option<String> = row.get(2)?;
             let files_json: Option<String> = row.get(3)?;
             let created_at: i64 = row.get(4)?;
             let is_pinned: bool = row.get(5)?;
             let content_type = ClipType::from(type_str);
             
             let preview = match content_type {
                ClipType::Text | ClipType::Html => text.unwrap_or_default().chars().take(50).collect(),
                ClipType::Image => "[图片]".to_string(),
                ClipType::Files => "[文件]".to_string(),
            };
            Ok(ClipItem { id, content_type, preview, created_at, is_pinned })
        })?;

        let mut items = Vec::new();
        for row in rows { items.push(row?); }
        Ok(items)
    }

    /// 获取详情 (用于粘贴)
    pub fn get_content(&self, id: i64) -> Result<ClipData> {
        let mut stmt = self.conn.prepare(
            "SELECT type, content_text, content_html, content_image_path, content_file_paths 
             FROM clips WHERE id = ?1"
        )?;
        
        let item = stmt.query_row(params![id], |row| {
            let type_str: String = row.get(0)?;
            let text: Option<String> = row.get(1)?;
            let html: Option<String> = row.get(2)?;
            let img_path: Option<String> = row.get(3)?;
            let file_paths: Option<String> = row.get(4)?;
            
            Ok((type_str, text, html, img_path, file_paths))
        })?;

        let (t_str, text, html, img_path, file_paths) = item;

        match ClipType::from(t_str) {
            ClipType::Text => Ok(ClipData::Text(text.unwrap_or_default())),
            ClipType::Html => Ok(ClipData::Html {
                text: text.unwrap_or_default(),
                html: html.unwrap_or_default(),
            }),
            ClipType::Image => {
                if let Some(path) = img_path {
                    let full_path = self.image_dir.join(path);
                    let bytes = fs::read(full_path)?;
                    Ok(ClipData::Image(bytes))
                } else {
                    Err(rusqlite::Error::QueryReturnedNoRows.into())
                }
            },
            ClipType::Files => {
                if let Some(json) = file_paths {
                    let paths: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
                    Ok(ClipData::Files(paths))
                } else {
                    Ok(ClipData::Files(vec![]))
                }
            }
        }
    }

    // ==========================================
    // 内部 helper
    // ==========================================

    /// 通用的 Upsert 逻辑
    fn upsert_record<F>(
        tx: &Transaction,
        ctype: ClipType,
        hash: &str,
        executor: F, // 闭包，用于执行具体的 SQL
        
        // 各种可选字段
        text: Option<&str>,
        html: Option<&str>,
        img_path: Option<&str>,
        file_paths: Option<&str>,
    ) -> Result<i64>
    where
        F: FnOnce(&str, &[&dyn rusqlite::ToSql]) -> rusqlite::Result<usize>,
    {
        // 1. 构造 SQL
        let sql = "INSERT INTO clips (type, content_hash, created_at, content_text, content_html, content_image_path, content_file_paths)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                   ON CONFLICT(content_hash) DO UPDATE SET
                      created_at = excluded.created_at";
        
        // 2. 执行
        executor(sql, params![
            ctype.to_string(),
            hash,
            Utc::now().timestamp(),
            text,
            html,
            img_path,
            file_paths
        ])?;

        // 3. 获取 ID
        let id: i64 = tx.query_row(
            "SELECT id FROM clips WHERE content_hash = ?1",
            params![hash],
            |row| row.get(0),
        )?;

        Ok(id)
    }

    fn find_id_by_hash(&self, hash: &str) -> Result<Option<i64>> {
        self.conn.query_row(
            "SELECT id FROM clips WHERE content_hash = ?1",
            params![hash],
            |row| row.get(0),
        ).optional().map_err(Into::into)
    }
    
    fn touch_record(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE clips SET created_at = ?1 WHERE id = ?2",
            params![Utc::now().timestamp(), id],
        )?;
        Ok(())
    }

    fn compute_hash(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

}