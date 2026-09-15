import os
import shutil
from pathlib import Path
from backend.app.core.config import settings

class StorageService:
    def __init__(self):
        self.local_dir = settings.STORAGE_LOCAL_DIR
        self.photos_dir = self.local_dir / "photos"
        self.charts_dir = self.local_dir / "charts"
        self.photos_dir.mkdir(parents=True, exist_ok=True)
        self.charts_dir.mkdir(parents=True, exist_ok=True)

    def save_photo_file(self, filename: str, content: bytes) -> str:
        """
        Saves a raw patient intake photo to disk (or MinIO in cloud mode).
        Returns the relative storage path.
        """
        file_path = self.photos_dir / filename
        with open(file_path, "wb") as f:
            f.write(content)
        return str(file_path)

    def get_absolute_path(self, relative_or_absolute: str) -> str:
        p = Path(relative_or_absolute)
        if p.is_absolute():
            return str(p)
        return str(self.local_dir / relative_or_absolute)

storage_service = StorageService()
