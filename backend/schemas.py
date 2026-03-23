# schemas.py
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
    id: Optional[int] = None
    name: str
    barcode: str


class BarcodeOut(BaseModel):
    found: bool
    source: str
    product: Optional[BarcodeProductOut] = None


# ── Products ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    barcode: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None


class ProductOut(BaseModel):
    id: int
    barcode: Optional[str]
    name: str
    unit_count: int = 0
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


# ── Inventory grouped response ───────────────────────────────────────────────

class ProductSummary(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class InventoryGroupOut(BaseModel):
    product: ProductSummary
    items: list[InventoryItemOut]


# ── Product detail with items ────────────────────────────────────────────────

class ProductDetailOut(BaseModel):
    id: int
    barcode: Optional[str]
    name: str
    created_at: datetime
    items: list[InventoryItemOut]
    model_config = {"from_attributes": True}
