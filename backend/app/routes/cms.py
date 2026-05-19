import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import Optional
from app.models.database import get_db
from app.models.cms_models import Room, RoomImage, GalleryImage, ContentBlock
from app.core.auth import require_admin
from app.models.models import User

router = APIRouter(prefix="/api/cms", tags=["cms"])

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "rooms").mkdir(exist_ok=True)
(UPLOAD_DIR / "gallery").mkdir(exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
MAX_SIZE = 8 * 1024 * 1024  # 8MB


def save_upload(file: UploadFile, subfolder: str) -> str:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Endast JPEG, PNG, WebP och GIF tillåts")
    ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = UPLOAD_DIR / subfolder / filename
    with open(path, "wb") as f:
        content = file.file.read()
        if len(content) > MAX_SIZE:
            raise HTTPException(status_code=400, detail="Filen är för stor (max 8MB)")
        f.write(content)
    return f"/uploads/{subfolder}/{filename}"


def room_to_dict(r: Room, lang: str = "sv") -> dict:
    return {
        "id": r.id,
        "name": getattr(r, f"name_{lang}", r.name_sv),
        "desc": getattr(r, f"desc_{lang}", r.desc_sv) or "",
        "beds": getattr(r, f"beds_{lang}", r.beds_sv) or "",
        "image_path": r.image_path,
        "sort_order": r.sort_order,
        "images": [{"id": i.id, "image_path": i.image_path, "caption": i.caption_sv, "sort_order": i.sort_order} for i in r.images],
    }


# ── PUBLIK ──────────────────────────────────────────────
@router.get("/public/rooms")
def public_rooms(lang: str = "sv", db: Session = Depends(get_db)):
    rooms = db.query(Room).filter(Room.visible == True).order_by(Room.sort_order).all()
    return [room_to_dict(r, lang) for r in rooms]


@router.get("/public/gallery")
def public_gallery(lang: str = "sv", db: Session = Depends(get_db)):
    images = db.query(GalleryImage).filter(
        GalleryImage.visible == True,
        GalleryImage.use_in_gallery == True,
    ).order_by(GalleryImage.sort_order).all()
    return [{"id": i.id, "image_path": i.image_path, "alt": getattr(i, f"alt_{lang}", i.alt_sv) or "", "use_in_hero": i.use_in_hero} for i in images]


@router.get("/public/hero")
def public_hero(db: Session = Depends(get_db)):
    images = db.query(GalleryImage).filter(
        GalleryImage.visible == True,
        GalleryImage.use_in_hero == True,
    ).order_by(GalleryImage.sort_order).all()
    return [{"id": i.id, "image_path": i.image_path} for i in images]


@router.get("/public/content")
def public_content(lang: str = "sv", db: Session = Depends(get_db)):
    blocks = db.query(ContentBlock).all()
    return {b.key: getattr(b, f"value_{lang}", b.value_sv) or "" for b in blocks}


# ── ADMIN: RUM ───────────────────────────────────────────
@router.get("/admin/rooms")
def admin_list_rooms(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rooms = db.query(Room).order_by(Room.sort_order).all()
    return [room_to_dict(r) for r in rooms]


@router.post("/admin/rooms")
async def admin_create_room(
    name_sv: str = Form(...), name_en: str = Form(""), name_de: str = Form(""),
    desc_sv: str = Form(""), desc_en: str = Form(""), desc_de: str = Form(""),
    beds_sv: str = Form(""), beds_en: str = Form(""), beds_de: str = Form(""),
    sort_order: int = Form(0),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    image_path = save_upload(image, "rooms") if image and image.filename else None
    room = Room(name_sv=name_sv, name_en=name_en, name_de=name_de,
                desc_sv=desc_sv, desc_en=desc_en, desc_de=desc_de,
                beds_sv=beds_sv, beds_en=beds_en, beds_de=beds_de,
                image_path=image_path, sort_order=sort_order)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room_to_dict(room)


@router.put("/admin/rooms/{room_id}")
async def admin_update_room(
    room_id: int,
    name_sv: str = Form(...), name_en: str = Form(""), name_de: str = Form(""),
    desc_sv: str = Form(""), desc_en: str = Form(""), desc_de: str = Form(""),
    beds_sv: str = Form(""), beds_en: str = Form(""), beds_de: str = Form(""),
    sort_order: int = Form(0),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Rum hittades inte")
    room.name_sv = name_sv; room.name_en = name_en; room.name_de = name_de
    room.desc_sv = desc_sv; room.desc_en = desc_en; room.desc_de = desc_de
    room.beds_sv = beds_sv; room.beds_en = beds_en; room.beds_de = beds_de
    room.sort_order = sort_order
    if image and image.filename:
        if room.image_path:
            old = Path("/app") / room.image_path.lstrip("/")
            if old.exists(): old.unlink()
        room.image_path = save_upload(image, "rooms")
    db.commit()
    db.refresh(room)
    return room_to_dict(room)


@router.post("/admin/rooms/{room_id}/images")
async def admin_add_room_image(
    room_id: int,
    caption_sv: str = Form(""),
    sort_order: int = Form(0),
    image: UploadFile = File(...),
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Rum hittades inte")
    image_path = save_upload(image, "rooms")
    img = RoomImage(room_id=room_id, image_path=image_path, caption_sv=caption_sv, sort_order=sort_order)
    db.add(img)
    # Sätt som huvudbild om det är den första
    if not room.image_path:
        room.image_path = image_path
    db.commit()
    return {"ok": True, "image_path": image_path}


@router.delete("/admin/rooms/{room_id}/images/{image_id}")
def admin_delete_room_image(
    room_id: int, image_id: int,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    img = db.query(RoomImage).filter(RoomImage.id == image_id, RoomImage.room_id == room_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Bild hittades inte")
    path = Path("/app") / img.image_path.lstrip("/")
    if path.exists(): path.unlink()
    db.delete(img)
    db.commit()
    return {"ok": True}


@router.patch("/admin/rooms/{room_id}/toggle")
def admin_toggle_room(room_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Rum hittades inte")
    room.visible = not room.visible
    db.commit()
    return {"visible": room.visible}


@router.delete("/admin/rooms/{room_id}")
def admin_delete_room(room_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Rum hittades inte")
    db.delete(room)
    db.commit()
    return {"ok": True}


# ── ADMIN: GALLERI ───────────────────────────────────────
@router.get("/admin/gallery")
def admin_list_gallery(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(GalleryImage).order_by(GalleryImage.sort_order).all()


@router.post("/admin/gallery")
async def admin_upload_image(
    alt_sv: str = Form(""), alt_en: str = Form(""), alt_de: str = Form(""),
    use_in_hero: bool = Form(True), use_in_gallery: bool = Form(True),
    sort_order: int = Form(0),
    image: UploadFile = File(...),
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    image_path = save_upload(image, "gallery")
    img = GalleryImage(filename=image.filename, image_path=image_path,
                       alt_sv=alt_sv, alt_en=alt_en, alt_de=alt_de,
                       use_in_hero=use_in_hero, use_in_gallery=use_in_gallery,
                       sort_order=sort_order)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.patch("/admin/gallery/{image_id}")
def admin_update_image(
    image_id: int,
    use_in_hero: Optional[bool] = None, use_in_gallery: Optional[bool] = None,
    visible: Optional[bool] = None, sort_order: Optional[int] = None,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    img = db.query(GalleryImage).filter(GalleryImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Bild hittades inte")
    if use_in_hero is not None: img.use_in_hero = use_in_hero
    if use_in_gallery is not None: img.use_in_gallery = use_in_gallery
    if visible is not None: img.visible = visible
    if sort_order is not None: img.sort_order = sort_order
    db.commit()
    return img


@router.delete("/admin/gallery/{image_id}")
def admin_delete_image(image_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    img = db.query(GalleryImage).filter(GalleryImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Bild hittades inte")
    path = Path("/app") / img.image_path.lstrip("/")
    if path.exists(): path.unlink()
    db.delete(img)
    db.commit()
    return {"ok": True}


# ── ADMIN: INNEHÅLL ──────────────────────────────────────
@router.get("/admin/content")
def admin_list_content(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(ContentBlock).order_by(ContentBlock.key).all()


@router.put("/admin/content/{key}")
def admin_update_content(
    key: str, value_sv: str = "", value_en: str = "", value_de: str = "",
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    block = db.query(ContentBlock).filter(ContentBlock.key == key).first()
    if block:
        block.value_sv = value_sv; block.value_en = value_en; block.value_de = value_de
    else:
        block = ContentBlock(key=key, value_sv=value_sv, value_en=value_en, value_de=value_de)
        db.add(block)
    db.commit()
    return block
