# routers/barcode.py
# GET /api/barcode/{barcode}
#
# Resolves a scanned barcode to a product name.
# Check order:
#   1. Household's own products table (cache — free, instant)
#   2. Open Food Facts API (free, external, ~200ms)
#   3. Not found — client shows manual entry form
#
# This endpoint never creates a product row.
# The client uses the returned data to pre-fill the add-item form.

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Product, User
from schemas import BarcodeOut, BarcodeProductOut

router = APIRouter()

OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
HEADERS = {"User-Agent": "HouseholdInventoryApp/0.1"}


@router.get("/barcode/{barcode}", response_model=BarcodeOut)
def resolve_barcode(
    barcode: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Check the household's own products table first
    product = (
        db.query(Product)
        .filter(
            Product.household_id == current_user.household_id,
            Product.barcode == barcode,
        )
        .first()
    )
    if product:
        return BarcodeOut(
            found=True,
            source="cache",
            product=BarcodeProductOut(
                id=product.id,
                name=product.name,
                category=product.category,
                barcode=barcode,
            ),
        )

    # 2. Call Open Food Facts
    try:
        response = httpx.get(
            OPEN_FOOD_FACTS_URL.format(barcode=barcode),
            headers=HEADERS,
            timeout=5.0,
        )
        data = response.json()
        if data.get("status") == 1:  # 1 = product found
            p = data["product"]
            return BarcodeOut(
                found=True,
                source="open_food_facts",
                product=BarcodeProductOut(
                    name=p.get("product_name") or p.get("product_name_en") or "Unknown",
                    category=p.get("categories_tags", [None])[0],
                    barcode=barcode,
                ),
            )
    except httpx.RequestError:
        pass  # network error — fall through to not_found

    # 3. Nothing found
    return BarcodeOut(found=False, source="not_found")
