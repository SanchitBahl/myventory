# schemas.py
# Pydantic models that define the shape of every request body and response body.
#
# These are separate from the SQLAlchemy models in models.py.
# SQLAlchemy models = database tables.
# Pydantic schemas = JSON shapes the API accepts and returns.
#
# The "from_attributes = True" config lets Pydantic read SQLAlchemy
# model instances directly (so you can return a db row and Pydantic
# serialises it to JSON automatically).

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


# ── Household ────────────────────────────────────────────────────────────────

class HouseholdOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HouseholdUpdate(BaseModel):
    name: str


# ── Auth sync ────────────────────────────────────────────────────────────────

class AuthSyncOut(BaseModel):
    user_id: str
    household_id: int
    household_name: str
    is_new_user: bool


# ── Barcode ──────────────────────────────────────────────────────────────────

class BarcodeProductOut(BaseModel):
    id: Optional[int] = None        # present if source is "cache", absent otherwise
    name: str
    category: Optional[str] = None
    barcode: str


class BarcodeOut(BaseModel):
    found: bool
    source: str                     # "cache" | "open_food_facts" | "not_found"
    product: Optional[BarcodeProductOut] = None


# ── Products ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    barcode: Optional[str] = None
    category: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None


class ProductOut(BaseModel):
    id: int
    barcode: Optional[str]
    name: str
    category: Optional[str]
    unit_count: int = 0              # computed — number of inventory items for this product
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Inventory items ──────────────────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    product_id: int
    expires_at: Optional[date] = None
    notes: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    expires_at: Optional[date] = None
    notes: Optional[str] = None


class InventoryItemOut(BaseModel):
    id: int
    product_id: int
    expires_at: Optional[date]
    added_at: datetime
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ── Inventory grouped response (GET /api/inventory) ──────────────────────────

class ProductSummary(BaseModel):
    id: int
    name: str
    category: Optional[str]

    model_config = {"from_attributes": True}


class InventoryGroupOut(BaseModel):
    product: ProductSummary
    items: list[InventoryItemOut]


# ── Product detail with items (GET /api/products/{id}) ───────────────────────

class ProductDetailOut(BaseModel):
    id: int
    barcode: Optional[str]
    name: str
    category: Optional[str]
    created_at: datetime
    items: list[InventoryItemOut]

    model_config = {"from_attributes": True}
