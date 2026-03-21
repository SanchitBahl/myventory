# routers/inventory.py
# GET    /api/inventory       — list all items grouped by product
# POST   /api/inventory       — add one unit
# PATCH  /api/inventory/{id}  — update expiry or notes
# DELETE /api/inventory/{id}  — mark unit as consumed (hard delete)

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import InventoryItem, Product, User
from schemas import (
    InventoryGroupOut,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    ProductSummary,
)

router = APIRouter()


def _get_household_item(item_id: int, household_id: int, db: Session) -> InventoryItem:
    """Fetch an inventory item that belongs to this household, or raise 404."""
    item = (
        db.query(InventoryItem)
        .join(Product)
        .filter(InventoryItem.id == item_id, Product.household_id == household_id)
        .first()
    )
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
    # Fetch all products for this household that have at least one item
    products = (
        db.query(Product)
        .filter(Product.household_id == current_user.household_id)
        .all()
    )

    result = []
    for product in products:
        # Fetch items for this product, sorted by expiry (nearest first, nulls last)
        items_query = (
            db.query(InventoryItem)
            .filter(InventoryItem.product_id == product.id)
        )

        # Optional: filter to items expiring within N days
        if expiring_within_days is not None:
            cutoff = date.today() + timedelta(days=expiring_within_days)
            items_query = items_query.filter(
                InventoryItem.expires_at != None,
                InventoryItem.expires_at <= cutoff,
            )

        items = items_query.all()

        # Sort: items with an expiry date first (ascending), then nulls
        items.sort(key=lambda i: (i.expires_at is None, i.expires_at or date.max))

        if not items:
            continue  # skip products with no remaining units

        result.append(
            InventoryGroupOut(
                product=ProductSummary.model_validate(product),
                items=[InventoryItemOut.model_validate(i) for i in items],
            )
        )

    # Sort groups: by the earliest expiry in each group, or by product name
    if sort == "expiry":
        result.sort(key=lambda g: (
            g.items[0].expires_at is None,
            g.items[0].expires_at or date.max,
        ))
    else:
        result.sort(key=lambda g: g.product.name.lower())

    return result


@router.post("/inventory", response_model=InventoryItemOut, status_code=201)
def add_item(
    body: InventoryItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Confirm the product belongs to this household
    product = (
        db.query(Product)
        .filter(
            Product.id == body.product_id,
            Product.household_id == current_user.household_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    item = InventoryItem(
        product_id=body.product_id,
        expires_at=body.expires_at,
        notes=body.notes,
    )
    db.add(item)
    db.flush()
    return InventoryItemOut.model_validate(item)


@router.patch("/inventory/{item_id}", response_model=InventoryItemOut)
def update_item(
    item_id: int,
    body: InventoryItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = _get_household_item(item_id, current_user.household_id, db)

    if body.expires_at is not None:
        item.expires_at = body.expires_at
    if body.notes is not None:
        item.notes = body.notes

    return InventoryItemOut.model_validate(item)


@router.delete("/inventory/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = _get_household_item(item_id, current_user.household_id, db)
    db.delete(item)
