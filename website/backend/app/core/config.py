import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "PulseGuard Emergency Triage & Telemetry"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", 8000))
    SECRET_KEY: str = os.getenv("SECRET_KEY", "pulseguard_secret_2026")

    # Database
    DB_TYPE: str = os.getenv("DB_TYPE", "sqlite")
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR}/pulseguard.db")

    # Storage
    STORAGE_LOCAL_DIR: Path = BASE_DIR / os.getenv("STORAGE_LOCAL_DIR", "storage")
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    MINIO_BUCKET_NAME: str = os.getenv("MINIO_BUCKET_NAME", "pulseguard-data")

    # Telegram
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    PARAMEDIC_DEFAULT_CHAT_ID: str = os.getenv("PARAMEDIC_DEFAULT_CHAT_ID", "")

    # Alert Thresholds (Clinical NEWS2 / MEWS)
    HR_MIN: float = 45.0
    HR_MAX: float = 135.0
    RR_MIN: float = 9.0
    RR_MAX: float = 28.0
    SPO2_MIN: float = 90.0
    HRV_RMSSD_MIN: float = 15.0 # Low vagal tone indicator

settings = Settings()
settings.STORAGE_LOCAL_DIR.mkdir(parents=True, exist_ok=True)
(settings.STORAGE_LOCAL_DIR / "photos").mkdir(exist_ok=True)
(settings.STORAGE_LOCAL_DIR / "charts").mkdir(exist_ok=True)
