#!/usr/bin/env python3
"""
Seed default users (admin + dispatcher) into the users table.
Run once after applying V006 migration:
    python scripts/seed_users.py

Uses bcrypt directly (no passlib dependency at script-run time).
"""

import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(env_path)

if not os.getenv("DATABASE_URL"):
    host = os.getenv("DB_HOST", "localhost").replace("host.docker.internal", "localhost")
    os.environ["DATABASE_URL"] = (
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{host}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
    )

import bcrypt
from sqlalchemy import text
from app.database import engine

USERS = [
    {
        "email": "admin@clearway.cz",
        "password": "admin123",
        "full_name": "Ing. Petr Správce",
        "role": "admin",
    },
    {
        "email": "dispecink@hzs-pk.cz",
        "password": "dispatcher123",
        "full_name": "Jana Nováková",
        "role": "dispatcher",
    },
]


def seed():
    with engine.begin() as conn:
        for u in USERS:
            existing = conn.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": u["email"]},
            ).first()

            if existing:
                print(f"  SKIP  {u['email']} (already exists)")
                continue

            hashed = bcrypt.hashpw(u["password"].encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()
            conn.execute(
                text(
                    "INSERT INTO users (email, hashed_password, full_name, role) "
                    "VALUES (:email, :hashed_password, :full_name, :role)"
                ),
                {
                    "email": u["email"],
                    "hashed_password": hashed,
                    "full_name": u["full_name"],
                    "role": u["role"],
                },
            )
            print(f"  OK    {u['email']} ({u['role']})")

    print("\nDone.")


if __name__ == "__main__":
    seed()
