import json
import logging
from logging.handlers import RotatingFileHandler

from app.core.config import get_settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "timestamp": self.formatTime(record, self.datefmt),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    settings = get_settings()
    settings.log_file.parent.mkdir(parents=True, exist_ok=True)

    handler = RotatingFileHandler(settings.log_file, maxBytes=1_000_000, backupCount=3)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    if not any(isinstance(existing, RotatingFileHandler) for existing in root.handlers):
        root.addHandler(handler)

