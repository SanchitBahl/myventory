# models.py
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Household(Base):
    __tablename__ = "households"

    id         = Column(Integer, primary_key=True)
    name       = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users      = relationship("User",       back_populates="household")
    products   = relationship("Product",    back_populates="household")
    to_buy     = relationship("ToBuyItem",  back_populates="household")


class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True)
    email        = Column(String, nullable=False)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    household = relationship("Household", back_populates="users")


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        UniqueConstraint("household_id", "barcode", name="uq_barcode_per_household"),
    )

    id           = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    barcode      = Column(String, nullable=True)
    name         = Column(String, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    household = relationship("Household", back_populates="products")
    items     = relationship("InventoryItem", back_populates="product")
    to_buy    = relationship("ToBuyItem",     back_populates="product")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id         = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    expires_at = Column(Date, nullable=True)
    added_at   = Column(DateTime(timezone=True), server_default=func.now())
    notes      = Column(String, nullable=True)

    product = relationship("Product", back_populates="items")


class ToBuyItem(Base):
    __tablename__ = "to_buy_items"

    id           = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    product_id   = Column(Integer, ForeignKey("products.id"),   nullable=False)
    added_at     = Column(DateTime(timezone=True), server_default=func.now())
    notes        = Column(String, nullable=True)

    household = relationship("Household", back_populates="to_buy")
    product   = relationship("Product",   back_populates="to_buy")
