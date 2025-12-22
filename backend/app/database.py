import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. Get the database URL from environment variables
# If not set, default to a localhost connection (useful for local testing without Docker)
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://admin:password@localhost:5432/clearway_db"
)

# 2. Create the SQLAlchemy engine
# pool_pre_ping=True helps handle DB connection drops gracefully
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# 3. Create a SessionLocal class
# Each instance of this class will be a database session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Base class for ORM models
Base = declarative_base()

# Dependency to get a DB session in API endpoints
def get_db():
    """
    Creates a new database session for a request and closes it afterwards.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()