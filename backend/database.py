# database.py
# Sets up the database engine and session.
# Every endpoint that needs the database receives a session via the
# get_db dependency — FastAPI opens it before the endpoint runs and
# closes it (committing or rolling back) when the endpoint finishes.

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()  # reads .env file into os.environ

DATABASE_URL = os.environ["DATABASE_URL"]

# SQLite needs one extra flag (check_same_thread) that PostgreSQL does not.
# We detect which one we're using from the URL prefix and set args accordingly.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """
    FastAPI dependency. Opens a database session, yields it to the endpoint,
    then closes it when the endpoint is done — whether it succeeded or failed.

    Usage in an endpoint:
        def my_endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
