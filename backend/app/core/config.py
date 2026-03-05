import os

# JWT configuration — read from environment variables.
SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours

# Google Gemini
GOOGLE_API_KEY: str | None = os.getenv("GOOGLE_API_KEY")
