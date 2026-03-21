# models.py
# SQLAlchemy models for the Household Inventory Manager.
# Tables are created automatically on app startup via Base.metadata.create_all().
# No migrations needed for the POC — if you change the schema, drop and recreate.

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Household(Base):
    __tablename__ = "households"

    id         = Column(Integer, primary_key=True)
    name       = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users    = relationship("User",    back_populates="household")
    products = relationship("Product", back_populates="household")


class User(Base):
    __tablename__ = "users"

    # Clerk user ID is a string like "user_2abc..." — Clerk owns identity, not us
    id           = Column(String, primary_key=True)
    email        = Column(String, nullable=False)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    household = relationship("Household", back_populates="users")


class Product(Base):
    __tablename__ = "products"

    # Same barcode can exist in different households — unique per household only
    __table_args__ = (
        UniqueConstraint("household_id", "barcode", name="uq_barcode_per_household"),
    )

    id           = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    barcode      = Column(String, nullable=True)   # null for manually entered products
    name         = Column(String, nullable=False)
    category     = Column(String, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    household = relationship("Household", back_populates="products")
    items     = relationship("InventoryItem", back_populates="product")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id         = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    expires_at = Column(Date, nullable=True)    # null if no printed expiry date
    added_at   = Column(DateTime(timezone=True), server_default=func.now())
    notes      = Column(String, nullable=True)  # optional, e.g. "opened", "freezer"

    product = relationship("Product", back_populates="items")
