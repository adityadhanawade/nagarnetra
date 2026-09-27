import os
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import HTTPException
from supabase import Client, create_client

load_dotenv()


@lru_cache
def get_db() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env",
        )
    return create_client(url, key)
