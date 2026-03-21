# routers/products.py
# GET    /api/products        — list household products
# POST   /api/products        — create a product
# GET    /api/products/{id}   — get one product with all its units
# PATCH  /api/products/{id}   — update name or category
# DELETE /api/products/{id}   — delete product and all its units

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import InventoryItem, Product, User
from schemas import ProductCreate, ProductDetailOut, ProductOut, ProductUpdate

router = APIRouter()


def _get_household_product(product_id: int, household_id: int, db: Session) -> Product:
    """Fetch a product that belongs to this household, or raise 404."""
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.household_id == household_id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/products", response_model=list[ProductOut])
def list_products(
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Product).filter(Product.household_id == current_user.household_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))

    products = query.order_by(Product.name).all()

    # Attach unit_count to each product (Pydantic expects it but it's not a DB column)
    result = []
    for p in products:
        count = db.query(InventoryItem).filter(InventoryItem.product_id == p.id).count()
        out = ProductOut.model_validate(p)
        out.unit_count = count
        result.append(out)
    return result


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # If a barcode was provided, check it's not already in this household
    if body.barcode:
        existing = (
            db.query(Product)
            .filter(
                Product.household_id == current_user.household_id,
                Product.barcode == body.barcode,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Barcode already exists in this household")

    product = Product(
        household_id=current_user.household_id,
        barcode=body.barcode,
        name=body.name,
        category=body.category,
    )
    db.add(product)
    db.flush()

    out = ProductOut.model_validate(product)
    out.unit_count = 0
    return out


@router.get("/products/{product_id}", response_model=ProductDetailOut)
def get_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_household_product(product_id, current_user.household_id, db)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    body: ProductUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = _get_household_product(product_id, current_user.household_id, db)

    if body.name is not None:
        product.name = body.name
    if body.category is not None:
        product.category = body.category

    count = db.query(InventoryItem).filter(InventoryItem.product_id == product.id).count()
    out = ProductOut.model_validate(product)
    out.unit_count = count
    return out


@router.delete("/products/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = _get_household_product(product_id, current_user.household_id, db)

    # Hard delete all units first, then the product
    db.query(InventoryItem).filter(InventoryItem.product_id == product.id).delete()
    db.delete(product)
