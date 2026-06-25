import aiosqlite
from pathlib import Path

DB_PATH = Path.home() / "Library" / "Application Support" / "meeting-minutes-assistant" / "data.db"


async def get_db() -> aiosqlite.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    db = await get_db()
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS meetings (
            id TEXT PRIMARY KEY,
            filename TEXT,
            audio_path TEXT,
            transcript TEXT,
            minutes TEXT,
            duration REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id TEXT REFERENCES meetings(id),
            role TEXT,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # 轻量迁移：补充字段（已存在则忽略）
    async def add_column(name: str, ddl: str):
        cursor = await db.execute(f"PRAGMA table_info(meetings)")
        cols = await cursor.fetchall()
        if not any(c["name"] == name for c in cols):
            await db.execute(ddl)
    await add_column("segments", "ALTER TABLE meetings ADD COLUMN segments TEXT")
    await add_column("updated_at", "ALTER TABLE meetings ADD COLUMN updated_at TEXT")
    await db.commit()
    await db.close()


async def get_setting(key: str, default: str = "") -> str:
    db = await get_db()
    cursor = await db.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = await cursor.fetchone()
    await db.close()
    return row[0] if row else default


async def set_setting(key: str, value: str):
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, value),
    )
    await db.commit()
    await db.close()
