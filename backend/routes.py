# routes.py
# All API endpoints in one place.

import os
from datetime import date, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Household, InventoryItem, Product, User
from schemas import (
    AuthSyncOut,
    BarcodeOut,
    BarcodeProductOut,
    HouseholdOut,
    HouseholdUpdate,
    InventoryGroupOut,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    ProductCreate,
    ProductDetailOut,
    ProductOut,
    ProductSummary,
    ProductUpdate,
)

router = APIRouter()

CLERK_JWKS_URL = os.environ["CLERK_JWKS_URL"]
OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
OFF_HEADERS = {"User-Agent": "HouseholdInventoryApp/0.1"}

bearer_scheme = HTTPBearer()
_jwks_cache: dict = {}


def _get_jwks() -> dict:
    if not _jwks_cache:
        response = httpx.get(CLERK_JWKS_URL)
        response.raise_for_status()
        _jwks_cache.update(response.json())
    return _jwks_cache


# ── Auth ─────────────────────────────────────────────────────────────────────

@router.post("/auth/sync", response_model=AuthSyncOut)
def auth_sync(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, _get_jwks(), algorithms=["RS256"], options={"verify_aud": False})
        clerk_user_id: str = payload["sub"]
        email: str = payload.get("email", "")
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == clerk_user_id).first()
    if user:
        return AuthSyncOut(
            user_id=user.id,
            household_id=user.household_id,
            household_name=user.household.name,
            is_new_user=False,
        )

    default_name = email.split("@")[0] if email else "My Household"
    household = Household(name=default_name)
    db.add(household)
    db.flush()

    user = User(id=clerk_user_id, email=email, household_id=household.id)
    db.add(user)

    return AuthSyncOut(
        user_id=user.id,
        household_id=household.id,
        household_name=household.name,
        is_new_user=True,
    )


# ── Household ─────────────────────────────────────────────────────────────────

@router.get("/household", response_model=HouseholdOut)
def get_household(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Household).filter(Household.id == current_user.household_id).first()


@router.patch("/household", response_model=HouseholdOut)
def update_household(body: HouseholdUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    household = db.query(Household).filter(Household.id == current_user.household_id).first()
    household.name = body.name
    return household


# ── Barcode ───────────────────────────────────────────────────────────────────

@router.get("/barcode/{barcode}", response_model=BarcodeOut)
def resolve_barcode(barcode: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Check household cache first
    product = db.query(Product).filter(
        Product.household_id == current_user.household_id,
        Product.barcode == barcode,
    ).first()

    if product:
        return BarcodeOut(found=True, source="cache",
            product=BarcodeProductOut(id=product.id, name=product.name, category=product.category, barcode=barcode))

    # 2. Try Open Food Facts
    try:
        response = httpx.get(OPEN_FOOD_FACTS_URL.format(barcode=barcode), headers=OFF_HEADERS, timeout=5.0)
        data = response.json()
        if data.get("status") == 1:
            p = data["product"]
            return BarcodeOut(found=True, source="open_food_facts",
                product=BarcodeProductOut(
                    name=p.get("product_name") or p.get("product_name_en") or "Unknown",
                    category=p.get("categories_tags", [None])[0],
                    barcode=barcode,
                ))
    except httpx.RequestError:
        pass

    return BarcodeOut(found=False, source="not_found")


# ── Products ──────────────────────────────────────────────────────────────────

def _get_product(product_id: int, household_id: int, db: Session) -> Product:
    product = db.query(Product).filter(Product.id == product_id, Product.household_id == household_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/products", response_model=list[ProductOut])
def list_products(search: str | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Product).filter(Product.household_id == current_user.household_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    products = query.order_by(Product.name).all()

    result = []
    for p in products:
        count = db.query(InventoryItem).filter(InventoryItem.product_id == p.id).count()
        out = ProductOut.model_validate(p)
        out.unit_count = count
        result.append(out)
    return result


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(body: ProductCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.barcode:
        existing = db.query(Product).filter(
            Product.household_id == current_user.household_id,
            Product.barcode == body.barcode,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Barcode already exists in this household")

    product = Product(household_id=current_user.household_id, barcode=body.barcode, name=body.name, category=body.category)
    db.add(product)
    db.flush()

    out = ProductOut.model_validate(product)
    out.unit_count = 0
    return out


@router.get("/products/{product_id}", response_model=ProductDetailOut)
def get_product(product_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_product(product_id, current_user.household_id, db)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = _get_product(product_id, current_user.household_id, db)
    if body.name is not None:
        product.name = body.name
    if body.category is not None:
        product.category = body.category
    count = db.query(InventoryItem).filter(InventoryItem.product_id == product.id).count()
    out = ProductOut.model_validate(product)
    out.unit_count = count
    return out


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = _get_product(product_id, current_user.household_id, db)
    db.query(InventoryItem).filter(InventoryItem.product_id == product.id).delete()
    db.delete(product)


# ── Inventory ─────────────────────────────────────────────────────────────────

def _get_item(item_id: int, household_id: int, db: Session) -> InventoryItem:
    item = db.query(InventoryItem).join(Product).filter(
        InventoryItem.id == item_id,
        Product.household_id == household_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("/inventory", response_model=list[InventoryGroupOut])
def list_inventory(
    sort: str = "expiry",
    expiring_within_days: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    products = db.query(Product).filter(Product.household_id == current_user.household_id).all()

    result = []
    for product in products:
        items_query = db.query(InventoryItem).filter(InventoryItem.product_id == product.id)
        if expiring_within_days is not None:
            cutoff = date.today() + timedelta(days=expiring_within_days)
            items_query = items_query.filter(InventoryItem.expires_at != None, InventoryItem.expires_at <= cutoff)

        items = items_query.all()
        items.sort(key=lambda i: (i.expires_at is None, i.expires_at or date.max))

        if not items:
            continue

        result.append(InventoryGroupOut(
            product=ProductSummary.model_validate(product),
            items=[InventoryItemOut.model_validate(i) for i in items],
        ))

    if sort == "expiry":
        result.sort(key=lambda g: (g.items[0].expires_at is None, g.items[0].expires_at or date.max))
    else:
        result.sort(key=lambda g: g.product.name.lower())

    return result


@router.post("/inventory", response_model=InventoryItemOut, status_code=201)
def add_item(body: InventoryItemCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.query(Product).filter(
        Product.id == body.product_id,
        Product.household_id == current_user.household_id,
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    item = InventoryItem(product_id=body.product_id, expires_at=body.expires_at, notes=body.notes)
    db.add(item)
    db.flush()
    return InventoryItemOut.model_validate(item)


@router.patch("/inventory/{item_id}", response_model=InventoryItemOut)
def update_item(item_id: int, body: InventoryItemUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _get_item(item_id, current_user.household_id, db)
    if body.expires_at is not None:
        item.expires_at = body.expires_at
    if body.notes is not None:
        item.notes = body.notes
    return InventoryItemOut.model_validate(item)


@router.delete("/inventory/{item_id}", status_code=204)
def delete_item(item_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _get_item(item_id, current_user.household_id, db)
    db.delete(item)
